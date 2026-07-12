import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { getMonthlyReceivables } from "@/server/services/reports";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A6 · Monthly receivables report (1st, 09:00). Builds the previous-month report
 * (collected / invoiced / outstanding / aging / efficiency) and sends admin a WhatsApp
 * + email summary with a link to the printable report. One send per month per admin.
 * (SPEC §4 A6)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const prev = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - 1, 1));
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };
  const rep = await getMonthlyReceivables(sysCtx, prev.getUTCFullYear(), prev.getUTCMonth());
  const admins = await adminPhones(ctx.companyId);

  const body =
    `📊 Receivables — ${rep.label}\n` +
    `Collected: ${formatINR(rep.collected)}\n` +
    `Invoiced: ${formatINR(rep.invoiced)}\n` +
    `Outstanding: ${formatINR(rep.outstanding)}\n` +
    `Collection efficiency: ${rep.efficiencyPct ?? "—"}%\n` +
    `Aged 90+ days: ${formatINR(rep.aging["90+"])}\n` +
    `Full report: ${env.appUrl}/print/receivables/${rep.label}`;

  let sent = 0;
  let skipped = 0;
  for (const admin of admins) {
    const r = await deliver({
      name: "monthly-receivables",
      companyId: ctx.companyId,
      channel: "WHATSAPP",
      to: admin,
      body,
      dedupeKey: `A6:${rep.label}:${admin}`,
      dryRun: ctx.dryRun,
      payload: rep,
    });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  return {
    name: "monthly-receivables",
    sent,
    skipped,
    details: { month: rep.label, collected: rep.collected, invoiced: rep.invoiced, outstanding: rep.outstanding, efficiencyPct: rep.efficiencyPct, aging: rep.aging },
  };
}

export const monthlyReceivables: Automation = {
  id: "A6",
  name: "monthly-receivables",
  label: "Monthly receivables report",
  schedule: "1st of month 09:00",
  run,
};
