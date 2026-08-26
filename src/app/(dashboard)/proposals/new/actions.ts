"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth";
import { convertToProposal } from "@/server/services/lead";
import { saveVersion } from "@/server/services/proposal";
import type { CapacityCalc } from "@/lib/domain/proposal-document";
import { amcRatesValidityNote } from "@/lib/project-report-boilerplate";

export interface WizardInput {
  leadId: string;
  proposalType: string;
  technology?: string;
  plantType?: string;
  requestId?: string;
  capacityCalc?: CapacityCalc;
  summary?: string;
  /** AMC contract terms — these build the real ServiceContract when the proposal is won. */
  amc?: {
    termMonths?: number;
    frequency?: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
    visitsPerYear?: number;
    scope?: Record<string, string | undefined>;
    /** A second plant covered by the same contract (the sample AMC quotes an STP
     *  and an ETP together). Optional — absent reads as a single-plant document. */
    additionalPlants?: { plantType: string; capacityValue?: number; capacityUnit?: string }[];
  };
  /** Service job details — these build the ServiceTicket when the proposal is won. */
  service?: { jobDescription?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" };
  costLines: { item: string; amount: number; qty?: number; rate?: number; unit?: string }[];
}

/**
 * Create a proposal from the wizard.
 *
 * Goes through the SAME `convertToProposal` as the lead-detail button and the request
 * queue — one write path, so a wizard-created proposal can never differ structurally
 * from one made any other way. That call also seeds the per-technology document
 * content and marks the originating request FULFILLED inside its transaction.
 *
 * The wizard's own inputs (capacity calculation, the priced lines) are then written
 * through `saveVersion`, which owns totals, validation and the documentData merge.
 * Two steps rather than widening convertToProposal, because saveVersion is where the
 * BOQ/GST/rounding invariants live and they should not be duplicated.
 */
export async function createProposalFromWizardAction(input: WizardInput) {
  const session = await getSession();
  requireAdmin(session);

  const res = await convertToProposal(session, input.leadId, {
    proposalType: input.proposalType,
    technology: input.technology,
    plantType: input.plantType,
    requestId: input.requestId,
  });

  // An `already` hit means this enquiry had that document type — don't overwrite the
  // existing proposal's content with a fresh form's values; just open it.
  if (!res.already) {
    const isProjectReport = input.proposalType === "Project Proposal";
    await saveVersion(session, res.proposalId, {
      boqItems: input.costLines.map((l) => ({
        // The Project Report prices four rolled-up buckets, a BOQ prices many lines,
        // an AMC prices per-month × months, the Service proforma quantity × rate.
        // ALL FOUR are ordinary BOQItem rows — only the print template reads them
        // differently — so subtotal/GST/grandTotal and the Won→Order milestone
        // derivation stay completely untouched by the proposal type.
        category: "Others",
        item: l.item,
        unit: l.unit ?? "Lot",
        qty: l.qty ?? 1,
        // rate × qty must equal amount, or the printed table contradicts the total.
        rate: l.rate ?? l.amount,
        amount: l.amount,
        aiSuggested: false,
      })),
      documentData: {
        ...(isProjectReport && input.capacityCalc ? { capacityCalc: input.capacityCalc } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        // Each type's own fields. saveVersion validates against THIS proposal's schema
        // and strips anything foreign, so sending the wrong shape can't corrupt it.
        ...(input.amc ?? {}),
        // The line under the AMC charge table restates the term, so it is derived
        // rather than typed — a 24-month AMC must not print "for 1 year only".
        ...(input.amc ? { ratesValidityNote: amcRatesValidityNote(input.amc.termMonths) } : {}),
        ...(input.service ?? {}),
      },
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/proposal-requests");
  revalidatePath(`/leads/${input.leadId}`);
  return res;
}
