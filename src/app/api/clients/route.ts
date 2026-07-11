import { api } from "@/lib/api";
import { listClients } from "@/server/services/client";

/** Cursor pagination for the clients list ("Load more"). Employee is scoped by listClients. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listClients(session, {
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return { items, nextCursor };
});
