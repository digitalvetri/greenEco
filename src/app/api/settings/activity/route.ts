import { api } from "@/lib/api";
import { listAuditLog } from "@/server/services/user-admin";
import type { AuditAction } from "@/lib/audit";

export const GET = api(async (session, req) => {
  const url = new URL(req.url);
  const p = url.searchParams;
  const action = p.get("action");
  return listAuditLog(session, {
    action: action ? (action as AuditAction) : undefined,
    cursor: p.get("cursor") ?? undefined,
  });
});
