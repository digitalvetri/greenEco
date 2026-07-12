import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";
import { budgetVsActual } from "@/server/services/erection";
import { deliver } from "./deliver";
import { adminPhones, isEnabled } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A8 · Budget threshold alerts (event-driven + 19:00 sweep). On an approved cost mutation
 * (and nightly as a safety net) compute consumed % and, when a project crosses 70/90/100%
 * for the first time, WhatsApp admin. 100% also opens a BUDGET_OVERRUN task. Idempotent per
 * project per threshold. (SPEC §5 A8)
 */
const THRESHOLDS = [70, 90, 100];

export async function checkBudgetThreshold(ctx: { companyId: string }, orderId: string, dryRun = false): Promise<number> {
  if (!(await isEnabled(ctx.companyId, "A8"))) return 0;
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };
  let bva: { pctConsumed?: number; spent?: unknown; budget?: unknown; committed?: unknown };
  try {
    bva = await budgetVsActual(sysCtx, orderId);
  } catch {
    return 0;
  }
  const pct = bva.pctConsumed ?? 0;
  if (pct < 70) return 0;

  const [order, admins, adminUser] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { orderNo: true } }),
    adminPhones(ctx.companyId),
    prisma.user.findFirst({ where: { companyId: ctx.companyId, role: "ADMIN", active: true }, select: { id: true } }),
  ]);

  let alerted = 0;
  for (const t of THRESHOLDS) {
    if (pct < t) continue;
    const body = `⚠️ ${order?.orderNo} crossed ${t}% of budget. Spent ${formatINR(String(bva.spent ?? 0))} of ${formatINR(String(bva.budget ?? 0))}, committed ${formatINR(String(bva.committed ?? 0))}.`;
    for (const admin of admins) {
      const r = await deliver({ name: "budget-alerts", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A8:${orderId}:${t}:${admin}`, dryRun, payload: { threshold: t, pct } });
      if (r.sent) alerted++;
    }
    if (t === 100 && !dryRun && adminUser) {
      const existing = await prisma.automationTask.findFirst({ where: { companyId: ctx.companyId, type: "BUDGET_OVERRUN", entityId: orderId, status: "OPEN" } });
      if (!existing) {
        await prisma.automationTask.create({
          data: { companyId: ctx.companyId, type: "BUDGET_OVERRUN", title: `Budget overrun: ${order?.orderNo}`, entity: "Order", entityId: orderId, assigneeId: adminUser.id },
        });
      }
    }
  }
  return alerted;
}

async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const orders = await prisma.order.findMany({
    where: { companyId: ctx.companyId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  let sent = 0;
  for (const o of orders) sent += await checkBudgetThreshold(ctx, o.id, ctx.dryRun);
  return { name: "budget-alerts", sent, skipped: 0, details: { swept: orders.length } };
}

export const budgetAlerts: Automation = {
  id: "A8",
  name: "budget-alerts",
  label: "Budget threshold alerts",
  schedule: "19:00 daily (+ event-driven)",
  run,
};
