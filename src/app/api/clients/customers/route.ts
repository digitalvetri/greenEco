import { api } from "@/lib/api";
import { listClientCustomers } from "@/server/services/client";

/** Offset pagination for the customer-grouped clients list ("Load more"). */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  return listClientCustomers(session, {
    search: p.get("search") ?? undefined,
    offset: p.get("offset") ? Number(p.get("offset")) : undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
});
