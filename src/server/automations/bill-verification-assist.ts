import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { isEnabled } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";
import type { Ctx } from "@/lib/rbac";

/**
 * A10 · Bill verification assist (event-driven, on ErectionEntry create with bills).
 * Claude vision extracts {amount, shopName, date, items, confidence}; compared to the
 * entered amount (±2%) + date (±3d) → PASS / MISMATCH / UNREADABLE (stored on the entry).
 * A PASS entry at/under AUTO_APPROVE_LIMIT auto-approves (reviewedById system:automation).
 * Assistive only — never edits the entered amount, never approves above the limit, and
 * degrades to plain PENDING if the API key is unset or vision fails. (SPEC §5 A10)
 */

interface BillExtract {
  amount?: number;
  shopName?: string;
  date?: string | null;
  items?: string[];
  confidence?: number;
}

export function visionAvailable(): boolean {
  return !!env.anthropicApiKey;
}

async function extractBillFromImage(url: string): Promise<BillExtract | null> {
  if (!env.anthropicApiKey) return null;
  try {
    const full = url.startsWith("http") ? url : `${env.appUrl}${url}`;
    const res = await fetch(full);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const msg = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: buf.toString("base64") } },
            {
              type: "text",
              text:
                'Extract this shop bill / receipt as STRICT JSON only, no prose: ' +
                '{"amount": number (grand total), "shopName": string, "date": "YYYY-MM-DD" or null, "items": string[], "confidence": number 0-1}. ' +
                "If it is unreadable or not a bill, return {\"confidence\": 0}.",
            },
          ],
        },
      ],
    });
    const block = msg.content.find((c) => c.type === "text");
    const text = block && "text" in block ? block.text : "";
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return null;
    return JSON.parse(text.slice(s, e + 1)) as BillExtract;
  } catch {
    return null;
  }
}

/** Run vision + comparison for one entry. Best-effort — never throws. */
export async function assistBillVerification(ctx: { companyId: string }, entryId: string, dryRun = false): Promise<"PASS" | "MISMATCH" | "UNREADABLE" | "SKIPPED"> {
  if (!(await isEnabled(ctx.companyId, "A10"))) return "SKIPPED";
  if (!visionAvailable()) return "SKIPPED";
  const entry = await prisma.erectionEntry.findFirst({ where: { id: entryId, order: { companyId: ctx.companyId } } });
  if (!entry) return "SKIPPED";
  const bills = (entry.billImages as { url: string }[]) ?? [];
  if (!bills.length) return "SKIPPED";

  const extract = await extractBillFromImage(bills[0].url);
  const entered = Number(entry.amount);
  let verdict: "PASS" | "MISMATCH" | "UNREADABLE";
  if (!extract || (extract.confidence ?? 0) < 0.3 || extract.amount == null) {
    verdict = "UNREADABLE";
  } else {
    const amtOk = Math.abs(extract.amount - entered) <= entered * 0.02;
    let dateOk = true;
    if (extract.date) {
      const bd = new Date(extract.date);
      if (!isNaN(bd.getTime())) dateOk = Math.abs(bd.getTime() - entry.date.getTime()) <= 3 * 86_400_000;
    }
    verdict = amtOk && dateOk ? "PASS" : "MISMATCH";
  }

  if (dryRun) return verdict;

  await prisma.erectionEntry.update({ where: { id: entryId }, data: { aiExtract: (extract ?? undefined) as never, aiMatch: verdict } });

  // Auto-approve only a vision-verified entry at/under the limit that is still pending.
  if (verdict === "PASS" && env.autoApproveLimit > 0 && entered <= env.autoApproveLimit && entry.status === "PENDING") {
    const sysCtx: Ctx = { userId: "system:automation", role: "ADMIN", companyId: ctx.companyId };
    await prisma.erectionEntry.update({ where: { id: entryId }, data: { status: "APPROVED", reviewedById: "system:automation" } });
    await logAudit(sysCtx, { action: "APPROVE", entity: "ErectionEntry", entityId: entryId, after: { aiMatch: "PASS", autoApproved: true } });
    try {
      const { checkBudgetThreshold } = await import("./budget-alerts");
      await checkBudgetThreshold(ctx, entry.orderId);
    } catch {
      /* best-effort */
    }
  }
  return verdict;
}

/** Registry stub — event-driven; present for the kill switch + Settings row. */
async function run(_ctx: AutomationContext): Promise<AutomationResult> {
  return { name: "bill-verification-assist", sent: 0, skipped: 0, details: { eventDriven: "runs on erection entry create with a bill", visionAvailable: visionAvailable() } };
}

export const billVerificationAssist: Automation = {
  id: "A10",
  name: "bill-verification-assist",
  label: "Bill verification (AI vision)",
  run,
};
