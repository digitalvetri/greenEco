import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { budgetVsActual } from "@/server/services/erection";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { dayRange } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A7 · Daily site digest (19:00). Per ACTIVE project, today's stages done / photos /
 * erection entries + pending-verification count + budget % (admin figure), composed into
 * one admin WhatsApp. Zero-activity projects are skipped. (SPEC §5 A7)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start, end } = dayRange(ctx.now);
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };
  const orders = await prisma.order.findMany({
    where: { companyId: ctx.companyId, status: "ACTIVE", deletedAt: null },
    select: { id: true, orderNo: true, clientName: true },
  });

  const lines: string[] = [];
  let totalPending = 0;
  for (const o of orders) {
    const [stagesDone, photos, entries, pending] = await Promise.all([
      prisma.stage.count({ where: { orderId: o.id, status: "DONE", actualDate: { gte: start, lt: end } } }),
      prisma.stagePhoto.count({ where: { stage: { orderId: o.id }, takenAt: { gte: start, lt: end } } }),
      prisma.erectionEntry.count({ where: { orderId: o.id, createdAt: { gte: start, lt: end } } }),
      prisma.erectionEntry.count({ where: { orderId: o.id, status: { in: ["PENDING", "QUERIED"] } } }),
    ]);
    totalPending += pending;
    if (stagesDone === 0 && photos === 0 && entries === 0) continue;
    let budgetPct = 0;
    try {
      const bva = await budgetVsActual(sysCtx, o.id);
      budgetPct = Math.round((bva as { pctConsumed?: number }).pctConsumed ?? 0);
    } catch {
      /* budget figure is best-effort */
    }
    lines.push(`${o.orderNo} ${o.clientName}: ${stagesDone} stage✓ · ${photos} photos · ${entries} entries · ${pending} pending · Budget ${budgetPct}%`);
  }

  const dateStr = start.toLocaleDateString("en-IN");
  const body = lines.length
    ? `🏗️ Site digest ${dateStr}\n${lines.join("\n")}\nPending verifications: ${totalPending} → ${env.appUrl}/erection`
    : `No site updates today across ${orders.length} active projects.`;

  let sent = 0;
  let skipped = 0;
  for (const admin of await adminPhones(ctx.companyId)) {
    const r = await deliver({ name: "daily-site-digest", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A7:${admin}:${start.toISOString().slice(0, 10)}`, dryRun: ctx.dryRun });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  return { name: "daily-site-digest", sent, skipped, details: { activeProjects: orders.length, withActivity: lines.length, pendingVerifications: totalPending } };
}

export const dailySiteDigest: Automation = {
  id: "A7",
  name: "daily-site-digest",
  label: "Daily site digest",
  schedule: "19:00 daily",
  run,
};
