import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { listProposalRequests, pendingProposalRequestCount } from "@/server/services/proposal-request";
import { listLeads } from "@/server/services/lead";
import { PageHeader } from "@/components/ui/stat";
import { ProposalsNav } from "../proposals-nav";
import { RequestProposalCard } from "./request-proposal-card";
import { RequestsList, type RequestRow } from "./requests-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proposal requests — Green Ecocare CRM" };

/**
 * Proposal requests — the field-staff → office handoff.
 *
 * ONE route for both roles, deliberately NOT mounted behind `{isAdmin && …}`: this
 * is the employee's entry point (raise a request + track their own), and the admin's
 * queue (triage + create the proposal). See proposals-nav.tsx for why that matters.
 */
export default async function ProposalRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const [{ items, nextCursor }, pending, leads] = await Promise.all([
    listProposalRequests(session, { status: status || undefined, take: 50 }),
    pendingProposalRequestCount(session),
    // Enquiries this user may raise a request against — listLeads is already
    // RBAC-scoped (an employee only sees their own), so no extra gate is needed.
    listLeads(session, { take: 100 }),
  ]);

  const rows: RequestRow[] = items.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    customerName: r.lead.customerName,
    address: r.lead.address,
    proposalType: r.proposalType,
    technology: r.technology,
    plantType: r.plantType,
    capacityValue: r.capacityValue,
    capacityUnit: r.capacityUnit,
    notes: r.notes,
    status: r.status,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt.toISOString(),
    proposal: r.proposal ? { id: r.proposal.id, number: r.proposal.number, status: r.proposal.status } : null,
  }));

  const leadOptions = leads.items.map((l) => ({
    id: l.id,
    label: l.customerName,
    hint: l.address,
    plantType: l.plantType,
    technology: l.technology,
    capacityValue: l.capacityValue ?? l.capacityKLD,
    capacityUnit: l.capacityUnit,
  }));

  return (
    <div>
      <PageHeader
        title="Proposal requests"
        subtitle={
          isAdmin
            ? `${pending} awaiting the office`
            : "Ask the office to prepare a proposal for one of your enquiries"
        }
      />
      <ProposalsNav isAdmin={isAdmin} requestCount={pending} />

      <div className="mb-4">
        <RequestProposalCard leads={leadOptions} />
      </div>

      <RequestsList
        key={status ?? "all"}
        initialItems={rows}
        initialCursor={nextCursor}
        status={status ?? ""}
        isAdmin={isAdmin}
      />
    </div>
  );
}
