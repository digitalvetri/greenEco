import { api, jsonBody } from "@/lib/api";
import { createErectionEntry, listEntries } from "@/server/services/erection";

/** REST endpoint for erection entries — offline-queue replay target. */
export const POST = api(async (session, req) => {
  const body = (await jsonBody(req)) as Parameters<typeof createErectionEntry>[1] & { date?: string };
  const entry = await createErectionEntry(session, { ...body, date: new Date(body.date ?? Date.now()) });
  return { ok: true, id: entry.id };
});

/** Cursor pagination for the entry list ("Load more"). Employee is creator-scoped by listEntries. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listEntries(session, {
    type: p.get("type") ?? undefined,
    status: p.get("status") ?? undefined,
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return {
    items: items.map((e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      amount: e.amount.toString(),
      status: e.status,
      orderNo: e.order.orderNo,
      clientName: e.order.clientName,
    })),
    nextCursor,
  };
});
