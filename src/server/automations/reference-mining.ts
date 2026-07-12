import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { getReferenceAnalytics } from "@/server/services/reports";
import { prisma } from "@/lib/prisma";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { yearQuarter } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A15 · Reference mining (quarterly). Ranks references by leads / conversions / won value,
 * proposes a thank-you list (top refs) + an ask-for-referral list (won clients who have not
 * referred anyone), and appends win-rate-by-band (A14). Admin summary. One run per quarter.
 * (SPEC §7 A15)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const q = yearQuarter(ctx.now);
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };
  const refs = await getReferenceAnalytics(sysCtx);
  const top = refs.slice(0, 5);

  // Ask-for-referral: clients with a completed order who aren't themselves a reference.
  const referenceNames = new Set(refs.map((r) => r.name.toLowerCase()));
  const wonClients = await prisma.order.findMany({
    where: { companyId: ctx.companyId, status: "COMPLETED", deletedAt: null },
    select: { clientName: true },
    take: 50,
  });
  const askList = [...new Set(wonClients.map((o) => o.clientName))].filter((n) => !referenceNames.has(n.toLowerCase())).slice(0, 5);

  const body =
    `🏆 Reference report ${q}\n` +
    (top.length ? top.map((r, i) => `${i + 1}. ${r.name} — ${r.leads} leads, ${formatINR(r.value)} won`).join("\n") : "No reference activity this quarter.") +
    `\nThank-you: ${top.map((r) => r.name).join(", ") || "—"}` +
    `\nAsk for referral: ${askList.join(", ") || "—"}` +
    `\n${env.appUrl}/reports`;

  let sent = 0;
  let skipped = 0;
  for (const admin of await adminPhones(ctx.companyId)) {
    const r = await deliver({ name: "reference-mining", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A15:${q}:${admin}`, dryRun: ctx.dryRun, payload: { top, askList } });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  return { name: "reference-mining", sent, skipped, details: { quarter: q, references: refs.length, topReferences: top.length, askForReferral: askList.length } };
}

export const referenceMining: Automation = {
  id: "A15",
  name: "reference-mining",
  label: "Reference mining",
  schedule: "Quarterly (1 Jan/Apr/Jul/Oct)",
  run,
};
