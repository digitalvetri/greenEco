import { api, jsonBody } from "@/lib/api";
import { createLeadSchema } from "@/lib/validation";
import { listLeads, createLead } from "@/server/services/lead";

export const GET = api(async (session, req) => {
  const url = new URL(req.url);
  const p = url.searchParams;
  return listLeads(session, {
    status: p.get("status") ?? undefined,
    source: p.get("source") ?? undefined,
    assignedToId: p.get("assignedToId") ?? undefined,
    cold: p.get("cold") === "1",
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
});

export const POST = api(async (session, req) => {
  const input = createLeadSchema.parse(await jsonBody(req));
  return createLead(session, input);
});
