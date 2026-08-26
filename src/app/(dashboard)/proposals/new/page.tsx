import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { listLeads } from "@/server/services/lead";
import { getProposalRequest } from "@/server/services/proposal-request";
import { PageHeader } from "@/components/ui/stat";
import { NewProposalWizard, type WizardLead } from "./new-proposal-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New proposal — Green Ecocare CRM" };

/**
 * Admin proposal creation. Deliberately its OWN route rather than more sections
 * bolted onto proposal-editor.tsx, which is already ~1,600 lines.
 *
 * Two ways in, both landing here:
 *   • from the request queue  → `?request=<id>`, prefilled from what the employee asked for
 *   • from a lead / the list  → `?lead=<id>` or nothing, prefilled from the lead's sizing
 *
 * Admin-only: an employee gets the 404 page. The service layer refuses independently
 * (convertToProposal is reached through an admin-gated action), so the sub-nav and
 * this check are navigation, not the boundary.
 */
export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; request?: string }>;
}) {
  const { lead: leadId, request: requestId } = await searchParams;
  const session = await getSession();
  if (session.role !== "ADMIN") notFound();

  const [{ items }, request] = await Promise.all([
    listLeads(session, { take: 200 }),
    requestId ? getProposalRequest(session, requestId) : Promise.resolve(null),
  ]);

  const leads: WizardLead[] = items.map((l) => ({
    id: l.id,
    customerName: l.customerName,
    address: l.address,
    projectName: l.projectName,
    projectAddress: l.projectAddress,
    plantType: l.plantType,
    technology: l.technology,
    capacityKLD: l.capacityKLD,
    capacityValue: l.capacityValue,
    capacityUnit: l.capacityUnit,
    segment: l.segment,
    // Types already quoted for this enquiry — the wizard disables them, since a
    // second proposal of the same type is a duplicate, not a new document.
    existingTypes: l.proposals.map((p) => p.proposalType ?? "Project Proposal"),
  }));

  return (
    <div>
      <PageHeader
        title="New proposal"
        subtitle={
          request
            ? `From ${request.lead.customerName}'s request for a ${request.proposalType}`
            : "Pick the enquiry and the document format, then fill in the details"
        }
        backHref={request ? "/proposal-requests" : "/proposals"}
      />
      <NewProposalWizard
        leads={leads}
        initialLeadId={request?.leadId ?? leadId ?? ""}
        initialType={request?.proposalType ?? "Project Proposal"}
        initialTechnology={request?.technology ?? null}
        initialPlantType={request?.plantType ?? null}
        requestId={request?.id ?? null}
        requestNotes={request?.notes ?? null}
      />
    </div>
  );
}
