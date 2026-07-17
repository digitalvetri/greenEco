import { api } from "@/lib/api";
import { listNotifications } from "@/server/services/notifications";

export const GET = api(async (session, req) => {
  const url = new URL(req.url);
  const p = url.searchParams;
  return listNotifications(session, {
    unreadOnly: p.get("unread") === "1",
    cursor: p.get("cursor") ?? undefined,
  });
});
