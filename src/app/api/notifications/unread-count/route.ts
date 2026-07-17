import { api } from "@/lib/api";
import { unreadCount } from "@/server/services/notifications";

/** Polled by the header bell for a live badge count (no WebSocket infra in this app). */
export const GET = api(async (session) => ({ count: await unreadCount(session) }));
