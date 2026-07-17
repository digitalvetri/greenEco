import { prisma } from "@/lib/prisma";
import { dayRange } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A16 · In-app notification sweep. Converts the 5 conditions the header bell used to
 * compute live on every page load (server/services/notifications.ts, pre-Phase-7) into
 * persisted per-entity AutomationTask rows — real inbox items with read/unread state,
 * not an ephemeral count that vanishes on refresh (Phase 7). Reuses the exact dedupe
 * pattern A3/A8/A9 already use: one OPEN task per (type, entityId); re-running the sweep
 * doesn't duplicate. Unlike A3/A8/A9, these have no auto-resolution hook wired to the
 * underlying condition clearing — intentional: event-fact, the user dismisses it in
 * /notifications, no cron logic tries to "un-generate" a task once the condition passes.
 *
 * Admin-only categories (verification pending, overdue payments) assign to the first
 * active admin — the same single-admin simplification budget-alerts.ts (A8) already
 * uses, not a new limitation. Ticket/visit tasks prefer the real assignee/technician and
 * fall back to that same admin when unassigned.
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start, end } = dayRange(ctx.now);
  let created = 0;

  async function upsertTask(input: {
    type: string;
    entity: string;
    entityId: string;
    title: string;
    assigneeId: string;
    dueDate?: Date | null;
  }): Promise<void> {
    if (ctx.dryRun) {
      created++;
      return;
    }
    const existing = await prisma.automationTask.findFirst({
      where: { companyId: ctx.companyId, type: input.type, entityId: input.entityId, status: "OPEN" },
    });
    if (existing) return;
    await prisma.automationTask.create({
      data: {
        companyId: ctx.companyId,
        type: input.type,
        title: input.title,
        entity: input.entity,
        entityId: input.entityId,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate ?? undefined,
      },
    });
    created++;
  }

  const firstAdmin = await prisma.user.findFirst({
    where: { companyId: ctx.companyId, role: "ADMIN", active: true },
    select: { id: true },
  });

  // 1. Follow-ups due today → the lead's owner.
  const followUps = await prisma.followUp.findMany({
    where: { nextDate: { gte: start, lt: end }, lead: { companyId: ctx.companyId } },
    select: { id: true, nextDate: true, lead: { select: { customerName: true, assignedToId: true } } },
  });
  for (const f of followUps) {
    if (!f.lead) continue; // the where clause already excludes these; guard is for TS
    await upsertTask({
      type: "FOLLOWUP_DUE",
      entity: "FollowUp",
      entityId: f.id,
      title: `Follow up with ${f.lead.customerName}`,
      assigneeId: f.lead.assignedToId,
      dueDate: f.nextDate,
    });
  }

  // 2. AMC preventive-maintenance visits DUE → the technician, else an admin.
  const visits = await prisma.maintenanceVisit.findMany({
    where: { contract: { companyId: ctx.companyId }, status: "DUE" },
    select: { id: true, technicianId: true, scheduledDate: true, contract: { select: { contractNo: true, clientName: true } } },
  });
  for (const v of visits) {
    const assignee = v.technicianId ?? firstAdmin?.id;
    if (!assignee) continue;
    await upsertTask({
      type: "VISIT_DUE",
      entity: "MaintenanceVisit",
      entityId: v.id,
      title: `AMC visit due — ${v.contract.contractNo} (${v.contract.clientName})`,
      assigneeId: assignee,
      dueDate: v.scheduledDate,
    });
  }

  // 3. High-priority open/in-progress tickets → the assignee, else an admin.
  const tickets = await prisma.serviceTicket.findMany({
    where: { companyId: ctx.companyId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "CRITICAL"] } },
    select: { id: true, ticketNo: true, title: true, assignedToId: true },
  });
  for (const t of tickets) {
    const assignee = t.assignedToId ?? firstAdmin?.id;
    if (!assignee) continue;
    await upsertTask({
      type: "HIGH_PRIORITY_TICKET",
      entity: "ServiceTicket",
      entityId: t.id,
      title: `${t.ticketNo}: ${t.title}`,
      assigneeId: assignee,
    });
  }

  if (firstAdmin) {
    // 4. Erection entries pending verification (admin-only cross-author cost view).
    const entries = await prisma.erectionEntry.findMany({
      where: { order: { companyId: ctx.companyId }, status: "PENDING" },
      select: { id: true, type: true, order: { select: { orderNo: true } } },
    });
    for (const e of entries) {
      await upsertTask({
        type: "VERIFICATION_PENDING",
        entity: "ErectionEntry",
        entityId: e.id,
        title: `Verify ${e.type} entry — ${e.order.orderNo}`,
        assigneeId: firstAdmin.id,
      });
    }

    // 5. Overdue payment milestones (admin-only money surface).
    const overdue = await prisma.paymentMilestone.findMany({
      where: { order: { companyId: ctx.companyId }, status: { in: ["DUE", "PARTIALLY_PAID"] }, dueDate: { lt: ctx.now } },
      select: { id: true, dueDate: true, order: { select: { orderNo: true, clientName: true } } },
    });
    for (const m of overdue) {
      await upsertTask({
        type: "OVERDUE_PAYMENT",
        entity: "PaymentMilestone",
        entityId: m.id,
        title: `Overdue payment — ${m.order.orderNo} (${m.order.clientName})`,
        assigneeId: firstAdmin.id,
        dueDate: m.dueDate,
      });
    }
  }

  return { name: "notification-sweep", sent: 0, skipped: 0, details: { tasksCreated: created } };
}

export const notificationSweep: Automation = {
  id: "A16",
  name: "notification-sweep",
  label: "In-app notification sweep",
  schedule: "08:00 / 14:00 / 19:00 daily",
  run,
};
