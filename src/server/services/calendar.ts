import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import type { FollowUpType } from "@prisma/client";

// CALL | SITE_VISIT | WHATSAPP | EMAIL | MEETING — matches the Prisma enum exactly.
// "TASK" is our own extension for AutomationTask rows.
export type CalendarEventType = FollowUpType | "TASK";

export type CalendarEvent = {
  id: string;
  entityType: "follow-up" | "task";
  type: CalendarEventType;
  title: string;
  subtitle: string | null;
  date: string; // ISO UTC — client converts to IST for display
  isOverdue: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  leadId: string | null;
  proposalId: string | null;
  ownerName: string;
  ownerInitials: string;
};

export type CalendarStatusFilter = "pending" | "completed" | "overdue" | undefined;

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Returns calendar events (follow-ups + automation tasks) in [from, to).
 * RBAC: EMPLOYEE sees only events assigned to or created by them.
 */
export async function listCalendarEvents(
  ctx: Ctx,
  {
    from,
    to,
    type,
    ownerId,
    status,
  }: {
    from: Date;
    to: Date;
    type?: string;
    ownerId?: string;
    status?: CalendarStatusFilter;
  },
): Promise<CalendarEvent[]> {
  const now = new Date();

  // ── Follow-ups ───────────────────────────────────────────────────────────
  // Use if/let so TypeScript infers the include'd relation type correctly
  let fuRows: Awaited<ReturnType<typeof queryFollowUps>> = [];
  if (type !== "TASK") {
    fuRows = await queryFollowUps(ctx, from, to, type as FollowUpType | undefined, ownerId);
  }

  // ── Automation Tasks ─────────────────────────────────────────────────────
  let taskRows: Awaited<ReturnType<typeof queryTasks>> = [];
  if (!type || type === "TASK") {
    taskRows = await queryTasks(ctx, from, to, ownerId);
  }

  // ── Build user name map ──────────────────────────────────────────────────
  const userIds = new Set<string>();
  for (const f of fuRows) { if (f.lead?.assignedToId) userIds.add(f.lead.assignedToId); }
  for (const t of taskRows) { userIds.add(t.assigneeId); }

  const userList =
    userIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(userIds) }, companyId: ctx.companyId },
          select: { id: true, name: true },
        })
      : [];
  const nameMap = new Map(userList.map((u) => [u.id, u.name]));

  // ── Assemble events ──────────────────────────────────────────────────────
  const events: CalendarEvent[] = [];

  for (const f of fuRows) {
    const date = f.nextDate!;
    const isCompleted = !!f.completedAt;
    const isOverdue = date < now && !isCompleted;

    if (status === "completed" && !isCompleted) continue;
    if (status === "pending" && (isCompleted || isOverdue)) continue;
    if (status === "overdue" && (!isOverdue || isCompleted)) continue;

    const ownerName = f.lead ? (nameMap.get(f.lead.assignedToId) ?? "Unassigned") : "Unassigned";
    const title = f.lead?.customerName ?? f.proposal?.projectName ?? "Follow-up";

    events.push({
      id: f.id,
      entityType: "follow-up",
      type: f.type,
      title,
      subtitle: f.notes ? f.notes.slice(0, 100) : null,
      date: date.toISOString(),
      isOverdue,
      isCompleted,
      completedAt: f.completedAt?.toISOString() ?? null,
      leadId: f.leadId,
      proposalId: f.proposalId,
      ownerName,
      ownerInitials: initials(ownerName),
    });
  }

  for (const t of taskRows) {
    if (!t.dueDate) continue;
    if (status === "completed") continue;
    const isOverdue = t.dueDate < now;
    if (status === "pending" && isOverdue) continue;
    if (status === "overdue" && !isOverdue) continue;

    const ownerName = nameMap.get(t.assigneeId) ?? "Unassigned";
    events.push({
      id: t.id,
      entityType: "task",
      type: "TASK",
      title: t.title,
      subtitle: t.note,
      date: t.dueDate.toISOString(),
      isOverdue,
      isCompleted: false,
      completedAt: null,
      leadId: null,
      proposalId: null,
      ownerName,
      ownerInitials: initials(ownerName),
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Helpers split out so TypeScript infers the include'd relation type ────

async function queryFollowUps(
  ctx: Ctx,
  from: Date,
  to: Date,
  type?: FollowUpType,
  ownerId?: string,
) {
  return prisma.followUp.findMany({
    where: {
      nextDate: { gte: from, lt: to },
      ...(type ? { type } : {}),
      lead: {
        companyId: ctx.companyId,
        deletedAt: null,
        ...(ownerId ? { assignedToId: ownerId } : {}),
        ...(ctx.role !== "ADMIN"
          ? { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] }
          : {}),
      },
    },
    include: {
      lead: { select: { id: true, customerName: true, assignedToId: true } },
      proposal: { select: { id: true, projectName: true } },
    },
    orderBy: { nextDate: "asc" },
    take: 500,
  });
}

async function queryTasks(ctx: Ctx, from: Date, to: Date, ownerId?: string) {
  return prisma.automationTask.findMany({
    where: {
      companyId: ctx.companyId,
      dueDate: { gte: from, lt: to },
      status: "OPEN",
      ...(ownerId ? { assigneeId: ownerId } : {}),
      ...(ctx.role !== "ADMIN" ? { assigneeId: ctx.userId } : {}),
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────

/** Mark a follow-up as done. RBAC via lead ownership. */
export async function completeFollowUp(ctx: Ctx, id: string): Promise<void> {
  const fu = await prisma.followUp.findFirst({
    where: { id },
    include: {
      lead: { select: { companyId: true, assignedToId: true, createdById: true } },
    },
  });
  if (!fu || fu.lead?.companyId !== ctx.companyId) throw new Error("Not found");
  if (
    ctx.role !== "ADMIN" &&
    fu.lead?.assignedToId !== ctx.userId &&
    fu.lead?.createdById !== ctx.userId
  ) {
    throw new Error("Access denied");
  }
  const now = new Date();
  await prisma.followUp.update({ where: { id }, data: { completedAt: now } });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "FollowUp",
    entityId: id,
    after: { completedAt: now.toISOString(), leadId: fu.leadId },
  });
}

/** Reschedule a follow-up to a new date. RBAC via lead ownership. */
export async function rescheduleFollowUp(
  ctx: Ctx,
  id: string,
  newDate: Date,
  notes?: string,
): Promise<void> {
  const fu = await prisma.followUp.findFirst({
    where: { id },
    include: {
      lead: { select: { companyId: true, assignedToId: true, createdById: true } },
    },
  });
  if (!fu || fu.lead?.companyId !== ctx.companyId) throw new Error("Not found");
  if (
    ctx.role !== "ADMIN" &&
    fu.lead?.assignedToId !== ctx.userId &&
    fu.lead?.createdById !== ctx.userId
  ) {
    throw new Error("Access denied");
  }
  await prisma.followUp.update({
    where: { id },
    data: {
      nextDate: newDate,
      completedAt: null,
      ...(notes !== undefined ? { notes } : {}),
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "FollowUp",
    entityId: id,
    after: { nextDate: newDate.toISOString(), leadId: fu.leadId },
  });
}
