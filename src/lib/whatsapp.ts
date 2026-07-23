/**
 * WhatsApp delivery (spec Phase 4). Three transports, tried in order:
 *   1. Direct WhatsApp Cloud API   (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID) — preferred
 *   2. n8n relay webhook           (WHATSAPP_WEBHOOK_URL)
 *   3. no-op                       (nothing configured; app still runs)
 *
 * Nothing here auto-decides — payment reminders / proposal delivery / admin
 * digests are the only message types, all triggered by cron or an admin action.
 *
 * ⚠️ Live delivery is NOT verified in this repo (no WhatsApp token). Message
 * rendering + transport selection + gating are unit-tested; sending needs a
 * Meta WhatsApp Business number. Runbook: PRODUCTION-REPORT.md.
 */

import { log } from "@/lib/logger";
import { loadConfig } from "@/lib/runtime-config";

export type WhatsAppEvent =
  | { kind: "PAYMENT_REMINDER"; to: string; orderNo: string; amount: string; dueDate: string; client: string }
  | { kind: "PROPOSAL_DELIVERY"; to: string; number: string; url: string; projectName: string }
  | { kind: "ADMIN_DIGEST"; summary: Record<string, unknown> };

export interface SendResult {
  sent: boolean;
  transport: "cloud-api" | "n8n" | "none";
  reason?: string;
}

/** Human-readable message body for the recipient transports. Pure/deterministic. */
export function renderMessage(event: WhatsAppEvent): string {
  switch (event.kind) {
    case "PAYMENT_REMINDER":
      return `Dear ${event.client}, a payment of ${event.amount} for project ${event.orderNo} is due on ${event.dueDate}. — Green Ecocare`;
    case "PROPOSAL_DELIVERY":
      return `Your proposal ${event.number} for "${event.projectName}" is ready: ${event.url} — Green Ecocare`;
    case "ADMIN_DIGEST":
      return `Green Ecocare daily digest: ${JSON.stringify(event.summary)}`;
  }
}

function recipientOf(event: WhatsAppEvent): string | undefined {
  return "to" in event ? event.to : undefined;
}

export async function sendWhatsApp(event: WhatsAppEvent): Promise<SendResult> {
  const to = recipientOf(event);
  const cfg = await loadConfig();
  const cloudApi = Boolean(cfg.WHATSAPP_TOKEN && cfg.WHATSAPP_PHONE_ID);

  // 1) Direct Cloud API — only for messages addressed to a specific number.
  if (cloudApi && to) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.WHATSAPP_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\D/g, ""),
          type: "text",
          text: { body: renderMessage(event) },
        }),
      });
      if (res.ok) return { sent: true, transport: "cloud-api" };
      log.warn("whatsapp cloud-api failed", { status: res.status });
      return { sent: false, transport: "cloud-api", reason: `cloud-api ${res.status}` };
    } catch (e) {
      return { sent: false, transport: "cloud-api", reason: e instanceof Error ? e.message : "network error" };
    }
  }

  // 2) n8n relay — forwards the structured event (handles ADMIN_DIGEST too).
  if (cfg.WHATSAPP_WEBHOOK_URL) {
    try {
      const res = await fetch(cfg.WHATSAPP_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...event, text: renderMessage(event) }),
      });
      return { sent: res.ok, transport: "n8n", reason: res.ok ? undefined : `n8n ${res.status}` };
    } catch (e) {
      return { sent: false, transport: "n8n", reason: e instanceof Error ? e.message : "network error" };
    }
  }

  // 3) Nothing configured.
  return { sent: false, transport: "none", reason: "no WhatsApp transport configured" };
}

/**
 * Send a free-text WhatsApp message to a number (in-app compose). Same transport
 * ladder as sendWhatsApp: direct Cloud API → n8n relay → no-op. Returns which
 * transport handled it so the caller can record SENT / FAILED / LOGGED.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  const digits = to.replace(/\D/g, "");
  const cfg = await loadConfig();
  if (cfg.WHATSAPP_TOKEN && cfg.WHATSAPP_PHONE_ID) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.WHATSAPP_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: digits, type: "text", text: { body } }),
      });
      if (res.ok) return { sent: true, transport: "cloud-api" };
      log.warn("whatsapp text send failed", { status: res.status });
      return { sent: false, transport: "cloud-api", reason: `cloud-api ${res.status}` };
    } catch (e) {
      return { sent: false, transport: "cloud-api", reason: e instanceof Error ? e.message : "network error" };
    }
  }
  if (cfg.WHATSAPP_WEBHOOK_URL) {
    try {
      const res = await fetch(cfg.WHATSAPP_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "TEXT", to: digits, text: body }),
      });
      return { sent: res.ok, transport: "n8n", reason: res.ok ? undefined : `n8n ${res.status}` };
    } catch (e) {
      return { sent: false, transport: "n8n", reason: e instanceof Error ? e.message : "network error" };
    }
  }
  return { sent: false, transport: "none", reason: "no WhatsApp transport configured" };
}
