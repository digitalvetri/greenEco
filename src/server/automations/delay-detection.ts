import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { dayRange, yearWeek } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A9 · Stage delay detection (08:00). Stages PENDING/IN_PROGRESS past their planned date
 * with no delay reason → an AutomationTask + a WhatsApp to the project engineer to reply
 * with a reason + new date; admin gets a consolidated list. Weekly re-nudge until resolved;
 * the task auto-closes when order.updateStage records a delayReason. (SPEC §5 A9)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start } = dayRange(ctx.now);
  const week = yearWeek(ctx.now);

  const stages = await prisma.stage.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      plannedDate: { lt: start },
      delayReason: null,
      order: { companyId: ctx.companyId, status: "ACTIVE", deletedAt: null },
    },
    include: { order: { select: { id: true, orderNo: true } } },
  });

  const orderIds = [...new Set(stages.map((s) => s.order.id))];
  const team = await prisma.teamAssignment.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, userId: true } });
  const engineerByOrder = new Map<string, string>();
  for (const t of team) if (!engineerByOrder.has(t.orderId)) engineerByOrder.set(t.orderId, t.userId);
  const users = await prisma.user.findMany({ where: { id: { in: [...engineerByOrder.values()] }, active: true }, select: { id: true, name: true, phone: true } });
  const userById = new Map(users.map((u) => [u.id, u]));
  const admins = await adminPhones(ctx.companyId);

  let sent = 0;
  let skipped = 0;
  let tasks = 0;
  const delayed: { order: string; stage: string; days: number }[] = [];

  for (const s of stages) {
    const days = Math.floor((start.getTime() - (s.plannedDate as Date).getTime()) / 86_400_000);
    delayed.push({ order: s.order.orderNo, stage: s.name, days });
    const engineerId = engineerByOrder.get(s.order.id);

    if (engineerId) {
      if (!ctx.dryRun) {
        const existing = await prisma.automationTask.findFirst({
          where: { companyId: ctx.companyId, type: "STAGE_DELAY", entityId: s.id, status: "OPEN" },
        });
        if (!existing) {
          await prisma.automationTask.create({
            data: { companyId: ctx.companyId, type: "STAGE_DELAY", title: `Delay: ${s.name} on ${s.order.orderNo}`, entity: "Stage", entityId: s.id, assigneeId: engineerId },
          });
          tasks++;
        }
      } else {
        tasks++;
      }
      const eng = userById.get(engineerId);
      if (eng?.phone) {
        const body = `'${s.name}' on ${s.order.orderNo} passed its planned date (${(s.plannedDate as Date).toLocaleDateString("en-IN")}). Please reply in the app with a reason + new date.\n${env.appUrl}/projects/${s.order.id}`;
        const r = await deliver({ name: "delay-detection", companyId: ctx.companyId, channel: "WHATSAPP", to: eng.phone, body, dedupeKey: `A9:${s.id}:${week}`, dryRun: ctx.dryRun, payload: { days } });
        if (r.sent) sent++;
        if (r.skipped) skipped++;
      }
    }
  }

  if (delayed.length && admins.length) {
    const body = `🚧 Delayed stages (${delayed.length}):\n` + delayed.slice(0, 12).map((d) => `${d.order} — ${d.stage} (${d.days}d)`).join("\n");
    for (const admin of admins) {
      const r = await deliver({ name: "delay-detection", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A9:admin:${admin}:${week}`, dryRun: ctx.dryRun });
      if (r.sent) sent++;
      if (r.skipped) skipped++;
    }
  }

  return { name: "delay-detection", sent, skipped, details: { delayed: delayed.length, tasksCreated: tasks } };
}

export const delayDetection: Automation = {
  id: "A9",
  name: "delay-detection",
  label: "Stage delay detection",
  schedule: "08:00 daily",
  run,
};
