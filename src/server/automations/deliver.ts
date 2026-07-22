import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import type { Channel } from "./types";

/**
 * Single delivery choke point (AUTOMATION-ENGINE-SPEC §2.6). Handles idempotency via
 * the AutomationLog `dedupeKey` (unique), routes to WhatsApp/email/in-app, and records
 * every attempt. Dry-run computes + logs under a `dry:` key so it never blocks a real send.
 *
 * Idempotency rule: skip only when a *SENT* row for the real dedupeKey already exists.
 * FAILED/SKIPPED rows don't block a retry; DRY_RUN rows are namespaced and never collide.
 */

export interface DeliverInput {
  name: string;
  companyId: string;
  channel: Channel;
  to?: string;
  body: string;
  subject?: string;
  dedupeKey: string;
  dryRun?: boolean;
  payload?: unknown;
}

export interface DeliverResult {
  sent: boolean;
  skipped: boolean;
  status: "SENT" | "SKIPPED" | "FAILED" | "DRY_RUN";
  reason?: string;
}

/** Has a real (non-dry) SENT log for this key? Used for idempotency + dry-run preview. */
export async function alreadySent(dedupeKey: string): Promise<boolean> {
  const row = await prisma.automationLog.findUnique({ where: { dedupeKey } });
  return row?.status === "SENT";
}

export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  if (await alreadySent(input.dedupeKey)) {
    return { sent: false, skipped: true, status: "SKIPPED", reason: "already-sent" };
  }

  if (input.dryRun) {
    await writeLog(`dry:${input.dedupeKey}`, input, "DRY_RUN", null);
    return { sent: false, skipped: false, status: "DRY_RUN" };
  }

  let status: DeliverResult["status"] = "SENT";
  let error: string | null = null;
  let sent = false;
  try {
    if (input.channel === "WHATSAPP" && input.to) {
      const r = await sendWhatsAppText(input.to, input.body);
      sent = r.sent;
      if (!r.sent) {
        status = "SKIPPED";
        error = r.reason ?? "whatsapp not configured";
      }
    } else if (input.channel === "EMAIL" && input.to) {
      const r = await sendEmail({ to: input.to, subject: input.subject ?? "Green Ecocare", html: input.body });
      sent = r.sent;
      if (!r.sent) {
        status = "SKIPPED";
        error = "email not configured";
      }
    } else if (input.channel === "INAPP" || input.channel === "PUSH") {
      // In-app rows come from AutomationTask (notifications.ts); real Web Push delivery
      // rides along with that same create — see createAutomationTask() in util.ts. This
      // branch is only reached by an automation that calls deliver() directly with no
      // AutomationTask involved, so it just logs the intent.
      sent = true;
    } else {
      status = "SKIPPED";
      error = "no target";
    }
  } catch (e) {
    status = "FAILED";
    error = e instanceof Error ? e.message : "delivery error";
  }

  await writeLog(input.dedupeKey, input, status, error);
  return { sent, skipped: status === "SKIPPED", status, reason: error ?? undefined };
}

async function writeLog(
  storedKey: string,
  input: DeliverInput,
  status: DeliverResult["status"],
  error: string | null,
): Promise<void> {
  const data = {
    companyId: input.companyId,
    name: input.name,
    channel: input.channel,
    target: input.to ?? null,
    payload: (input.payload ?? undefined) as never,
    status,
    error,
  };
  await prisma.automationLog.upsert({
    where: { dedupeKey: storedKey },
    create: { dedupeKey: storedKey, ...data },
    update: { ...data, createdAt: new Date() },
  });
}
