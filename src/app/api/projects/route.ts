import { api } from "@/lib/api";
import { listOrders } from "@/server/services/order";

/** Cursor pagination for the projects list ("Load more"). */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listOrders(session, {
    status: p.get("status") ?? undefined,
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return {
    items: items.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      clientName: o.clientName,
      siteAddress: o.siteAddress,
      status: o.status,
      projectValue: "projectValue" in o ? (o as { projectValue: string }).projectValue : undefined,
      progress: o.progress,
      nextDue: o.nextDue,
      overdue: o.overdue,
    })),
    nextCursor,
  };
});
