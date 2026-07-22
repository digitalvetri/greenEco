import webpush from "web-push";
import { prisma } from "./prisma";
import { env } from "./env";

/**
 * Web Push (OS/browser notifications) — the delivery side of the "PUSH" channel that
 * deliver.ts already declared but never implemented. Degrades cleanly with no VAPID
 * keys configured (same pattern as WhatsApp/email/AI providers): every send is a no-op
 * until an operator generates keys (`npx web-push generate-vapid-keys`, see .env.example).
 *
 * Server-only. Never import from a "use client" module — the private key must never
 * reach the browser bundle.
 */

let configured = false;
function ensureConfigured(): boolean {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
}

/** Sends to every device the user has subscribed on; prunes subscriptions the push
 *  service reports gone (410/404 — the browser/OS unregistered it). Never throws —
 *  a push failure must not break the automation or mutation that triggered it. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
      }
    }),
  );

  if (stale.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  return { sent, failed };
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const results = await Promise.all([...new Set(userIds)].map((id) => sendPushToUser(id, payload)));
  return results.reduce((acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }), { sent: 0, failed: 0 });
}
