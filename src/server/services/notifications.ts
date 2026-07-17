import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/**
 * Phase 7 — real notification inbox. Backed by the existing AutomationTask model
 * (A3/A8/A9 already write to it; A16 — notification-sweep.ts — now also writes to it
 * for the 5 conditions the old header bell computed live and threw away on refresh).
 * OPEN = unread, DONE = read, DISMISSED = deleted (hidden by default). No new schema.
 *
 * RBAC: a task is visible to the caller if `assigneeId === ctx.userId`, OR — for admins
 * only — its `type` is one of the admin-broadcast categories (assigned to a single
 * "first admin" by the generators, same simplification budget-alerts.ts already uses,
 * so any admin must be able to see it, not just the one that got auto-assigned).
 */

const ADMIN_BROADCAST_TYPES = ["VERIFICATION_PENDING", "OVERDUE_PAYMENT", "BUDGET_OVERRUN"] as const;

export interface NotificationItem {
  id: string;
  kind: string;
  label: string;
  detail: string;
  href: string;
  tone: "primary" | "warn" | "danger";
  read: boolean;
  createdAt: string;
}

const TONE: Record<string, NotificationItem["tone"]> = {
  FOLLOWUP_DUE: "primary",
  VISIT_DUE: "warn",
  HIGH_PRIORITY_TICKET: "danger",
  VERIFICATION_PENDING: "warn",
  OVERDUE_PAYMENT: "danger",
  STALE_PROPOSAL: "warn",
  STAGE_DELAY: "danger",
  BUDGET_OVERRUN: "danger",
};

const DETAIL: Record<string, string> = {
  FOLLOWUP_DUE: "Lead awaiting contact",
  VISIT_DUE: "AMC preventive maintenance",
  HIGH_PRIORITY_TICKET: "Open service request",
  VERIFICATION_PENDING: "Pending your approval",
  OVERDUE_PAYMENT: "Receivable past due",
  STALE_PROPOSAL: "No follow-up in 5 days",
  STAGE_DELAY: "Past its planned date",
  BUDGET_OVERRUN: "Crossed 100% of budget",
};

function visibilityWhere(ctx: Ctx) {
  return {
    companyId: ctx.companyId,
    OR: [
      { assigneeId: ctx.userId },
      ...(ctx.role === "ADMIN" ? [{ type: { in: [...ADMIN_BROADCAST_TYPES] } }] : []),
    ],
  };
}

/** Batch-resolve a deep link per (entity, entityId) — falls back to the section page. */
async function resolveHrefs(rows: { entity: string; entityId: string }[]): Promise<Map<string, string>> {
  const idsFor = (entity: string) => rows.filter((r) => r.entity === entity).map((r) => r.entityId);
  const hrefs = new Map<string, string>();

  const followUpIds = idsFor("FollowUp");
  if (followUpIds.length) {
    const rs = await prisma.followUp.findMany({ where: { id: { in: followUpIds } }, select: { id: true, leadId: true } });
    for (const r of rs) if (r.leadId) hrefs.set(`FollowUp:${r.id}`, `/leads/${r.leadId}`);
  }
  const visitIds = idsFor("MaintenanceVisit");
  if (visitIds.length) {
    const rs = await prisma.maintenanceVisit.findMany({ where: { id: { in: visitIds } }, select: { id: true, contractId: true } });
    for (const r of rs) hrefs.set(`MaintenanceVisit:${r.id}`, `/service/${r.contractId}`);
  }
  const ticketIds = idsFor("ServiceTicket");
  if (ticketIds.length) {
    const rs = await prisma.serviceTicket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, contractId: true } });
    for (const r of rs) hrefs.set(`ServiceTicket:${r.id}`, r.contractId ? `/service/${r.contractId}` : "/service");
  }
  const entryIds = idsFor("ErectionEntry");
  if (entryIds.length) {
    const rs = await prisma.erectionEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, orderId: true } });
    for (const r of rs) hrefs.set(`ErectionEntry:${r.id}`, `/erection/${r.orderId}`);
  }
  const milestoneIds = idsFor("PaymentMilestone");
  if (milestoneIds.length) {
    const rs = await prisma.paymentMilestone.findMany({ where: { id: { in: milestoneIds } }, select: { id: true, orderId: true } });
    for (const r of rs) hrefs.set(`PaymentMilestone:${r.id}`, `/projects/${r.orderId}`);
  }
  const proposalIds = idsFor("Proposal");
  for (const id of proposalIds) hrefs.set(`Proposal:${id}`, `/proposals/${id}`);
  const orderIds = idsFor("Order");
  for (const id of orderIds) hrefs.set(`Order:${id}`, `/projects/${id}`);
  const stageIds = idsFor("Stage");
  if (stageIds.length) {
    const rs = await prisma.stage.findMany({ where: { id: { in: stageIds } }, select: { id: true, orderId: true } });
    for (const r of rs) hrefs.set(`Stage:${r.id}`, `/projects/${r.orderId}`);
  }

  return hrefs;
}

function toItem(row: { id: string; type: string; title: string; entity: string; entityId: string; status: string; createdAt: Date }, hrefs: Map<string, string>): NotificationItem {
  return {
    id: row.id,
    kind: row.type,
    label: row.title,
    detail: DETAIL[row.type] ?? row.entity,
    href: hrefs.get(`${row.entity}:${row.entityId}`) ?? "/dashboard",
    tone: TONE[row.type] ?? "primary",
    read: row.status !== "OPEN",
    createdAt: row.createdAt.toISOString(),
  };
}

/** Bell dropdown — latest unread items + a company/assignee-scoped unread count. */
export async function getNotifications(ctx: Ctx): Promise<NotificationItem[]> {
  const rows = await prisma.automationTask.findMany({
    where: { ...visibilityWhere(ctx), status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const hrefs = await resolveHrefs(rows);
  return rows.map((r) => toItem(r, hrefs));
}

export async function unreadCount(ctx: Ctx): Promise<number> {
  return prisma.automationTask.count({ where: { ...visibilityWhere(ctx), status: "OPEN" } });
}

/** Full inbox — paginated, optional unread-only filter. Dismissed items are always hidden. */
export async function listNotifications(
  ctx: Ctx,
  filters: { unreadOnly?: boolean; cursor?: string; take?: number } = {},
): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  const take = filters.take ?? 30;
  const rows = await prisma.automationTask.findMany({
    where: {
      ...visibilityWhere(ctx),
      status: filters.unreadOnly ? "OPEN" : { not: "DISMISSED" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const hrefs = await resolveHrefs(page);
  return {
    items: page.map((r) => toItem(r, hrefs)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Mark one notification read. RBAC-scoped via the same visibility clause — a task
 *  outside the caller's scope is silently a no-op (0 rows matched), not an error. */
export async function markNotificationRead(ctx: Ctx, id: string): Promise<{ ok: true }> {
  await prisma.automationTask.updateMany({
    where: { id, ...visibilityWhere(ctx) },
    data: { status: "DONE" },
  });
  return { ok: true };
}

export async function markAllNotificationsRead(ctx: Ctx): Promise<{ ok: true }> {
  await prisma.automationTask.updateMany({
    where: { ...visibilityWhere(ctx), status: "OPEN" },
    data: { status: "DONE" },
  });
  return { ok: true };
}

/** "Delete" = DISMISSED, not a row delete — a persistent condition (still-overdue
 *  payment, still-open ticket) legitimately resurfaces on the next sweep if it's still
 *  true; a one-time condition (a specific day's follow-up) simply won't recur. This is
 *  the same event-fact model the rest of the automation engine already uses. */
export async function dismissNotification(ctx: Ctx, id: string): Promise<{ ok: true }> {
  await prisma.automationTask.updateMany({
    where: { id, ...visibilityWhere(ctx) },
    data: { status: "DISMISSED" },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "AutomationTask", entityId: id, after: { status: "DISMISSED" } });
  return { ok: true };
}
