import { env } from "./env";
import { log, errFields } from "./logger";
import { loadConfig } from "./runtime-config";

/**
 * Transactional email via the Resend HTTP API (Phase 1). Uses fetch — no SDK —
 * so it adds zero dependencies. No-op (and says so) when RESEND_API_KEY /
 * EMAIL_FROM are unset, so the app runs without email configured.
 *
 * ⚠️ Delivery is NOT verified in this repo (no API key available). The payload
 * shape and gating are unit-tested; live sending needs a Resend account.
 * Runbook: PRODUCTION-REPORT.md → "Phase 1 integrations".
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Optional attachments (e.g. a generated PDF). */
  attachments?: { filename: string; content: string /* base64 */ }[];
  replyTo?: string;
}

export interface EmailResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

/** Env-only quick check (used by unit tests). The live send resolves DB-over-env config. */
export function isEmailConfigured(): boolean {
  return Boolean(env.resendApiKey && env.emailFrom);
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const cfg = await loadConfig();
  if (!cfg.RESEND_API_KEY || !cfg.EMAIL_FROM) {
    return { sent: false, reason: "email not configured (RESEND_API_KEY/EMAIL_FROM)" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.EMAIL_FROM,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        reply_to: msg.replyTo,
        attachments: msg.attachments,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      log.warn("email send failed", { status: res.status, body: text.slice(0, 200) });
      return { sent: false, reason: `resend ${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    log.error("email send threw", errFields(e));
    return { sent: false, reason: e instanceof Error ? e.message : "network error" };
  }
}
