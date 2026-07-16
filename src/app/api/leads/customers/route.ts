import { api } from "@/lib/api";
import { listLeadCustomers } from "@/server/services/lead";

export const GET = api(async (session, req) => {
  const url = new URL(req.url);
  const p = url.searchParams;
  return listLeadCustomers(session, {
    status: p.get("status") ?? undefined,
    source: p.get("source") ?? undefined,
    assignedToId: p.get("assignedToId") ?? undefined,
    cold: p.get("cold") === "1",
    dueToday: p.get("dueToday") === "1",
    search: p.get("search") ?? undefined,
    offset: p.get("offset") ? Number(p.get("offset")) : undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
});
