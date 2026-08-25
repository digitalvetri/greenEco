import { api } from "@/lib/api";
import { listProposalRequests } from "@/server/services/proposal-request";

/** Cursor pagination for the proposal-requests list ("Load more").
 *  Role scoping (employee sees only their own) lives in the service, not here. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listProposalRequests(session, {
    status: p.get("status") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  // Flatten to the row shape the client list expects.
  return {
    items: items.map((r) => ({
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
    })),
    nextCursor,
  };
});
