import { api } from "@/lib/api";
import { listDrawingRequests } from "@/server/services/drawing";

/** Cursor pagination for the drawing-request queue ("Load more").
 *  Scoping (capability holders see all, others see their own) lives in the service. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listDrawingRequests(session, {
    status: p.get("status") ?? undefined,
    view: p.get("view") ?? undefined,
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return {
    items: items.map((r) => ({
      id: r.id,
      title: r.title,
      discipline: r.discipline,
      purpose: r.purpose,
      notes: r.notes,
      status: r.status,
      priority: r.priority,
      changeReason: r.changeReason,
      dueDate: r.dueDate?.toISOString() ?? null,
      overdue: r.overdue,
      createdAt: r.createdAt.toISOString(),
      requestedById: r.requestedById,
      assignedToId: r.assignedToId,
      project: r.order ? { id: r.order.id, label: r.order.clientName || r.order.orderNo } : null,
      enquiry: r.lead ? { id: r.lead.id, label: r.lead.customerName } : null,
      latestDrawing: r.drawings[0]
        ? {
            id: r.drawings[0].id,
            revision: r.drawings[0].revision,
            fileUrl: r.drawings[0].fileUrl,
            approvalStatus: r.drawings[0].approvalStatus,
          }
        : null,
    })),
    nextCursor,
  };
});
