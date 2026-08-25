"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth";
import { convertToProposal } from "@/server/services/lead";
import { saveVersion } from "@/server/services/proposal";
import type { CapacityCalc } from "@/lib/domain/proposal-document";

export interface WizardInput {
  leadId: string;
  proposalType: string;
  technology?: string;
  plantType?: string;
  requestId?: string;
  capacityCalc?: CapacityCalc;
  summary?: string;
  costLines: { item: string; amount: number }[];
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
        // The Project Report prices four rolled-up buckets; a BOQ prices many lines.
        // Both are BOQItem rows — only the print template groups them differently —
        // so subtotal/GST/grandTotal and the Won→Order milestone derivation are
        // completely untouched by the proposal type.
        category: "Others",
        item: l.item,
        unit: "Lot",
        qty: 1,
        rate: l.amount,
        amount: l.amount,
        aiSuggested: false,
      })),
      documentData: {
        ...(isProjectReport && input.capacityCalc ? { capacityCalc: input.capacityCalc } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
      },
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/proposals/requests");
  revalidatePath(`/leads/${input.leadId}`);
  return res;
}
