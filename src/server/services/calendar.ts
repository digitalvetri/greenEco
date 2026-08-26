import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { visibleProposalWhere } from "./proposal-visibility";
import type { FollowUpType, Prisma } from "@prisma/client";

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

export type FollowUpBucket = "overdue" | "today" | "upcoming";

export type FollowUpWorklist = {
  sections: { bucket: FollowUpBucket; events: CalendarEvent[] }[];
  counts: Record<FollowUpBucket, number>;
  /** True when a source hit its row cap, so the UI can say so instead of implying
   *  the list is complete. Silent truncation reads as "you're all caught up". */
  truncated: boolean;
  horizonDays: number;
};

/** How far back overdue items are dredged up. Something 3 years stale is not a
 *  worklist item, it's an abandoned lead — and pulling them in would fill the cap. */
const OVERDUE_LOOKBACK_DAYS = 365;
const WORKLIST_TAKE = 300;

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Scope ─────────────────────────────────────────────────────────────────
// ONE definition of "which follow-ups may this user see", shared by the calendar,
// the worklist and the mutations. Two copies of this rule is exactly how a list and
// a calendar end up disagreeing about the same day, and how a mutation ends up more
// permissive than the read that surfaced the row.

export function followUpScope(ctx: Ctx, ownerId?: string): Prisma.FollowUpWhereInput {
  // Hanging off a lead — the lead's own ownership rule.
  const onALead: Prisma.FollowUpWhereInput = {
    lead: {
      companyId: ctx.companyId,
      deletedAt: null,
      ...(ownerId ? { assignedToId: ownerId } : {}),
      ...(ctx.role !== "ADMIN"
        ? { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] }
        : {}),
    },
  };

  // Hanging off a QUOTE. `addProposalFollowUp` writes proposalId and NO leadId, so
  // the required `lead` filter above silently dropped every one of them — the
  // calendar carried a `proposal.projectName` fallback that could never run. Two
  // gates apply instead: the office-only rule (an employee must never see activity
  // on a proposal the admin hasn't released — v44), and, for a non-admin, only what
  // they logged themselves, since this is a personal worklist.
  const ownership: Prisma.FollowUpWhereInput[] = [];
  if (ctx.role !== "ADMIN") ownership.push({ createdById: ctx.userId });
  if (ownerId) ownership.push({ createdById: ownerId });
  const onAProposal: Prisma.FollowUpWhereInput = {
    leadId: null,
    proposal: { companyId: ctx.companyId, ...visibleProposalWhere(ctx) },
    ...(ownership.length ? { AND: ownership } : {}),
  };

  return { OR: [onALead, onAProposal] };
}

export function taskScope(ctx: Ctx, ownerId?: string): Prisma.AutomationTaskWhereInput {
  return {
    companyId: ctx.companyId,
    status: "OPEN",
    ...(ownerId ? { assigneeId: ownerId } : {}),
    ...(ctx.role !== "ADMIN" ? { assigneeId: ctx.userId } : {}),
  };
}

// ── Queries ───────────────────────────────────────────────────────────────
// Split out as functions so TypeScript infers the include'd relation types.

async function queryFollowUps(
  ctx: Ctx,
  from: Date,
  to: Date,
  type?: FollowUpType,
  ownerId?: string,
  take = 500,
) {
  return prisma.followUp.findMany({
    where: {
      nextDate: { gte: from, lt: to },
      ...(type ? { type } : {}),
      ...followUpScope(ctx, ownerId),
    },
    include: {
      lead: { select: { id: true, customerName: true, assignedToId: true } },
      proposal: { select: { id: true, projectName: true, number: true } },
    },
    orderBy: { nextDate: "asc" },
    take,
  });
}

async function queryTasks(ctx: Ctx, from: Date, to: Date, ownerId?: string, take = 200) {
  return prisma.automationTask.findMany({
    where: { ...taskScope(ctx, ownerId), dueDate: { gte: from, lt: to } },
    orderBy: { dueDate: "asc" },
    take,
  });
}

type FollowUpRow = Awaited<ReturnType<typeof queryFollowUps>>[number];
type TaskRow = Awaited<ReturnType<typeof queryTasks>>[number];

async function nameMapFor(ctx: Ctx, fuRows: FollowUpRow[], taskRows: TaskRow[]) {
  const ids = new Set<string>();
  for (const f of fuRows) ids.add(f.lead?.assignedToId ?? f.createdById);
  for (const t of taskRows) ids.add(t.assigneeId);
  if (ids.size === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(ids) }, companyId: ctx.companyId },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Status filter, applied identically wherever events are produced. */
function passesStatus(status: CalendarStatusFilter, isCompleted: boolean, isOverdue: boolean) {
  if (status === "completed") return isCompleted;
  if (status === "pending") return !isCompleted && !isOverdue;
  if (status === "overdue") return isOverdue && !isCompleted;
  return true;
}

/**
 * The worklist's default differs from the calendar's, deliberately.
 *
 * A calendar with no status filter shows the whole window INCLUDING what's already
 * done — that's a record of the month. A worklist with no filter means "what do I
 * still owe", so a completed item must drop out of it; leaving it in is the defect
 * this module replaced, where a finished follow-up read as overdue forever. Pick
 * "Completed" explicitly to see them.
 */
function passesWorklistStatus(status: CalendarStatusFilter, isCompleted: boolean, isOverdue: boolean) {
  if (!status) return !isCompleted;
  return passesStatus(status, isCompleted, isOverdue);
}

function toFollowUpEvent(f: FollowUpRow, nameMap: Map<string, string>, now: Date): CalendarEvent {
  const date = f.nextDate!;
  const isCompleted = !!f.completedAt;
  // A proposal follow-up has no lead, so its owner is whoever logged it.
  const ownerName = nameMap.get(f.lead?.assignedToId ?? f.createdById) ?? "Unassigned";
  return {
    id: f.id,
    entityType: "follow-up",
    type: f.type,
    title: f.lead?.customerName ?? f.proposal?.projectName ?? "Follow-up",
    subtitle: f.notes ? f.notes.slice(0, 100) : null,
    date: date.toISOString(),
    isOverdue: date < now && !isCompleted,
    isCompleted,
    completedAt: f.completedAt?.toISOString() ?? null,
    leadId: f.leadId,
    proposalId: f.proposalId,
    ownerName,
    ownerInitials: initials(ownerName),
  };
}

function toTaskEvent(t: TaskRow, nameMap: Map<string, string>, now: Date): CalendarEvent {
  const ownerName = nameMap.get(t.assigneeId) ?? "Unassigned";
  return {
    id: t.id,
    entityType: "task",
    type: "TASK",
    title: t.title,
    subtitle: t.note,
    date: t.dueDate!.toISOString(),
    isOverdue: t.dueDate! < now,
    isCompleted: false,
    completedAt: null,
    leadId: null,
    proposalId: null,
    ownerName,
    ownerInitials: initials(ownerName),
  };
}

/**
 * Calendar events (follow-ups + automation tasks) in [from, to).
 * RBAC lives in `followUpScope` / `taskScope`, not here.
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
  const fuRows =
    type !== "TASK" ? await queryFollowUps(ctx, from, to, type as FollowUpType | undefined, ownerId) : [];
  const taskRows = !type || type === "TASK" ? await queryTasks(ctx, from, to, ownerId) : [];
  const nameMap = await nameMapFor(ctx, fuRows, taskRows);

  const events: CalendarEvent[] = [];
  for (const f of fuRows) {
    const e = toFollowUpEvent(f, nameMap, now);
    if (passesStatus(status, e.isCompleted, e.isOverdue)) events.push(e);
  }
  for (const t of taskRows) {
    if (!t.dueDate) continue;
    const e = toTaskEvent(t, nameMap, now);
    // A task has no completed state in this window (taskScope pins status OPEN).
    if (passesStatus(status, false, e.isOverdue)) events.push(e);
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The worklist behind the Follow-ups list view: everything still owed, bucketed
 * into Overdue / Today / Upcoming.
 *
 * Same scope and same mappers as the calendar, so the two views can never disagree
 * about a given day — the failure this module replaced (a separate
 * `upcomingFollowUps` in lead.ts that ignored `completedAt` and dropped proposal
 * follow-ups entirely, so a completed item showed as overdue forever).
 */
export async function listFollowUpWorklist(
  ctx: Ctx,
  {
    horizonDays = 30,
    type,
    ownerId,
    status,
  }: { horizonDays?: number; type?: string; ownerId?: string; status?: CalendarStatusFilter } = {},
): Promise<FollowUpWorklist> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const from = new Date(dayStart);
  from.setDate(from.getDate() - OVERDUE_LOOKBACK_DAYS);
  const to = new Date(dayEnd);
  to.setDate(to.getDate() + horizonDays);

  const fuRows =
    type !== "TASK"
      ? await queryFollowUps(ctx, from, to, type as FollowUpType | undefined, ownerId, WORKLIST_TAKE)
      : [];
  const taskRows = !type || type === "TASK" ? await queryTasks(ctx, from, to, ownerId, WORKLIST_TAKE) : [];
  const nameMap = await nameMapFor(ctx, fuRows, taskRows);

  const buckets: Record<FollowUpBucket, CalendarEvent[]> = { overdue: [], today: [], upcoming: [] };
  const place = (e: CalendarEvent) => {
    const when = new Date(e.date);
    const bucket: FollowUpBucket = when < dayStart ? "overdue" : when < dayEnd ? "today" : "upcoming";
    buckets[bucket].push(e);
  };

  for (const f of fuRows) {
    const e = toFollowUpEvent(f, nameMap, now);
    if (passesWorklistStatus(status, e.isCompleted, e.isOverdue)) place(e);
  }
  for (const t of taskRows) {
    if (!t.dueDate) continue;
    const e = toTaskEvent(t, nameMap, now);
    if (passesWorklistStatus(status, false, e.isOverdue)) place(e);
  }

  for (const key of Object.keys(buckets) as FollowUpBucket[]) {
    buckets[key].sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    sections: (["overdue", "today", "upcoming"] as FollowUpBucket[]).map((bucket) => ({
      bucket,
      events: buckets[bucket],
    })),
    counts: {
      overdue: buckets.overdue.length,
      today: buckets.today.length,
      upcoming: buckets.upcoming.length,
    },
    truncated: fuRows.length >= WORKLIST_TAKE || taskRows.length >= WORKLIST_TAKE,
    horizonDays,
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Load a follow-up the caller is allowed to act on — for EITHER anchor.
 *
 * Deliberately reuses `followUpScope`, so the write rule cannot drift from the read
 * rule. The previous version hard-required a lead (`fu.lead?.companyId !== ...`),
 * which meant a proposal follow-up threw "Not found" on every complete/reschedule.
 * Not-found and no-access collapse into one error so a probe can't tell them apart.
 */
async function loadActionable(ctx: Ctx, id: string) {
  const fu = await prisma.followUp.findFirst({ where: { id, ...followUpScope(ctx) } });
  if (!fu) throw new Error("Not found");
  return fu;
}

/** Mark a follow-up as done. */
export async function completeFollowUp(ctx: Ctx, id: string): Promise<void> {
  const fu = await loadActionable(ctx, id);
  const now = new Date();
  await prisma.followUp.update({ where: { id }, data: { completedAt: now } });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "FollowUp",
    entityId: id,
    after: { completedAt: now.toISOString(), leadId: fu.leadId, proposalId: fu.proposalId },
  });
}

/** Reschedule a follow-up to a new date, reopening it if it was already done. */
export async function rescheduleFollowUp(
  ctx: Ctx,
  id: string,
  newDate: Date,
  notes?: string,
): Promise<void> {
  const fu = await loadActionable(ctx, id);
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
    after: { nextDate: newDate.toISOString(), leadId: fu.leadId, proposalId: fu.proposalId },
  });
}
