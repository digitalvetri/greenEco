import { api } from "@/lib/api";
import { listContracts, listTickets } from "@/server/services/amc";

/** Cursor pagination for the Service/AMC lists ("Load more") — contracts or tickets. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const take = p.get("take") ? Number(p.get("take")) : undefined;
  const cursor = p.get("cursor") ?? undefined;
  const search = p.get("search") ?? undefined;

  if (p.get("kind") === "tickets") {
    const { items, nextCursor } = await listTickets(session, {
      openOnly: p.get("openOnly") === "1",
      search,
      cursor,
      take,
    });
    return {
      items: items.map((t) => ({
        id: t.id,
        ticketNo: t.ticketNo,
        title: t.title,
        priority: t.priority,
        status: t.status,
        raisedBy: t.raisedBy,
        slaDueDate: t.slaDueDate ? t.slaDueDate.toISOString() : null,
      })),
      nextCursor,
    };
  }

  const { items, nextCursor } = await listContracts(session, {
    status: p.get("status") ?? undefined,
    search,
    cursor,
    take,
  });
  return {
    items: items.map((c) => ({
      id: c.id,
      contractNo: c.contractNo,
      clientName: c.clientName,
      frequency: c.frequency,
      liveStatus: c.liveStatus,
      daysToExpiry: c.daysToExpiry,
      visitCount: c._count.visits,
      annualValue: "annualValue" in c ? (c as { annualValue: string }).annualValue : undefined,
    })),
    nextCursor,
  };
});
