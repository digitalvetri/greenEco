import { Prisma, type StageStatus } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin, requireProjectAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeMilestoneStatus } from "@/lib/domain/milestone";
import { formatINR } from "@/lib/money";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";

/** Progress % from stages (done / total). */
function progressOf(stages: { status: string }[]): number {
  if (!stages.length) return 0;
  const done = stages.filter((s) => s.status === "DONE").length;
  return Math.round((done / stages.length) * 100);
}

export interface OrderFilters {
  status?: string;
  search?: string;
  cursor?: string;
  take?: number;
}

/**
 * List projects with cursor pagination + search + status filter (before this the
 * service was an *unbounded* findMany — every order loaded every request). EMPLOYEE
 * is team-scoped. Each row carries derived progress + next-due.
 */
export async function listOrders(ctx: Ctx, filters: OrderFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const where: Prisma.OrderWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status as Prisma.EnumOrderStatusFilter["equals"] } : {}),
    ...(filters.search
      ? {
          OR: [
            { clientName: { contains: filters.search, mode: "insensitive" } },
            { orderNo: { contains: filters.search, mode: "insensitive" } },
            { siteAddress: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (ctx.role !== "ADMIN") {
    where.team = { some: { userId: ctx.userId } };
  }
  const rows = await prisma.order.findMany({
    where,
    include: {
      stages: { select: { status: true } },
      milestones: { select: { status: true, dueDate: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const now = Date.now();
  const items = stripPricing(
    page.map((o) => {
      const nextDue = nextDueDate(o.milestones);
      return {
        id: o.id,
        orderNo: o.orderNo,
        clientName: o.clientName,
        siteAddress: o.siteAddress,
        status: o.status,
        projectValue: o.projectValue.toString(),
        progress: progressOf(o.stages),
        nextDue,
        overdue: Boolean(nextDue && new Date(nextDue).getTime() < now && o.status === "ACTIVE"),
      };
    }),
    ctx.role,
  );
  return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export interface ProjectAnalytics {
  total: number;
  funnel: { status: string; count: number }[];
  active: number;
  completed: number;
  valueInExecution: number; // Σ projectValue of ACTIVE (sell-side)
  avgProgressPct: number | null;
  doneStages: number;
  delayedStages: number;
  receivablesOutstanding: number;
  receivablesOverdue: number;
  overdueMilestones: number;
}

const ORDER_FUNNEL = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];

/**
 * Project-execution analytics (spec §7.3) — throughput, schedule slippage, and
 * receivables. Company-wide (team-scoped for EMPLOYEE). Sell-side only (project
 * value + receivables); admin-only budget/margin is excluded → role-agnostic.
 */
export async function projectAnalytics(ctx: Ctx): Promise<ProjectAnalytics> {
  const scope: Prisma.OrderWhereInput =
    ctx.role !== "ADMIN" ? { team: { some: { userId: ctx.userId } } } : {};
  const orders = await prisma.order.findMany({
    where: { companyId: ctx.companyId, deletedAt: null, ...scope },
    select: {
      status: true,
      projectValue: true,
      stages: { select: { status: true, delayReason: true } },
      milestones: { select: { status: true, dueDate: true, amount: true, receipts: { select: { amount: true } } } },
    },
  });

  const now = Date.now();
  const statusCount = new Map<string, number>();
  let active = 0,
    completed = 0,
    doneStages = 0,
    delayedStages = 0,
    overdueMilestones = 0;
  let valueInExecution = new Decimal(0),
    receivablesOutstanding = new Decimal(0),
    receivablesOverdue = new Decimal(0);
  let progressSum = 0,
    progressN = 0;

  for (const o of orders) {
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
    if (o.status === "ACTIVE") {
      active += 1;
      valueInExecution = valueInExecution.plus(new Decimal(o.projectValue));
      progressSum += progressOf(o.stages);
      progressN += 1;
    } else if (o.status === "COMPLETED") completed += 1;

    for (const s of o.stages) {
      if (s.status === "DONE") doneStages += 1;
      if (s.delayReason) delayedStages += 1;
    }
    for (const m of o.milestones) {
      if (m.status === "PAID") continue;
      const paid = m.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
      const outstanding = new Decimal(m.amount).minus(paid);
      if (outstanding.gt(0)) {
        receivablesOutstanding = receivablesOutstanding.plus(outstanding);
        if (m.dueDate && new Date(m.dueDate).getTime() < now) {
          overdueMilestones += 1;
          receivablesOverdue = receivablesOverdue.plus(outstanding);
        }
      }
    }
  }

  return {
    total: orders.length,
    funnel: ORDER_FUNNEL.filter((s) => statusCount.has(s)).map((s) => ({ status: s, count: statusCount.get(s)! })),
    active,
    completed,
    valueInExecution: Math.round(valueInExecution.toNumber()),
    avgProgressPct: progressN > 0 ? Math.round(progressSum / progressN) : null,
    doneStages,
    delayedStages,
    receivablesOutstanding: Math.round(receivablesOutstanding.toNumber()),
    receivablesOverdue: Math.round(receivablesOverdue.toNumber()),
    overdueMilestones,
  };
}

/** Pipeline KPIs for the projects header. Receivables ₹ is sell-side (visible to all). */
export async function orderStats(ctx: Ctx) {
  const scope: Prisma.OrderWhereInput =
    ctx.role !== "ADMIN" ? { team: { some: { userId: ctx.userId } } } : {};
  const orders = await prisma.order.findMany({
    where: { companyId: ctx.companyId, deletedAt: null, ...scope },
    select: {
      status: true,
      milestones: { select: { status: true, dueDate: true, amount: true, receipts: { select: { amount: true } } } },
    },
  });

  const now = Date.now();
  let active = 0,
    onHold = 0,
    completed = 0,
    overduePayments = 0;
  let receivables = new Decimal(0);
  for (const o of orders) {
    if (o.status === "ACTIVE") active += 1;
    else if (o.status === "ON_HOLD") onHold += 1;
    else if (o.status === "COMPLETED") completed += 1;
    for (const m of o.milestones) {
      if (m.status === "PAID") continue;
      const paid = m.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
      const outstanding = new Decimal(m.amount).minus(paid);
      if (outstanding.gt(0)) {
        receivables = receivables.plus(outstanding);
        if (m.dueDate && new Date(m.dueDate).getTime() < now) overduePayments += 1;
      }
    }
  }
  return { active, onHold, completed, overduePayments, receivables: Math.round(receivables.toNumber()) };
}

/**
 * Set a project's lifecycle status — makes the dead ON_HOLD/COMPLETED/CANCELLED
 * states reachable (same class of bug fixed for leads/proposals). Admin only,
 * audited. WON→Order created it ACTIVE; this is put-on-hold / complete / cancel /
 * reopen. requireProjectAccess isn't needed (admin-only).
 */
export async function setOrderStatus(
  ctx: Ctx,
  orderId: string,
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId } });
  if (!order) throw new Error("Project not found");
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Order",
    entityId: orderId,
    before: { status: order.status },
    after: { status },
  });
  return { ok: true };
}

function nextDueDate(milestones: { status: string; dueDate: Date | null }[]): string | null {
  const unpaid = milestones
    .filter((m) => m.status !== "PAID" && m.dueDate)
    .map((m) => m.dueDate!)
    .sort((a, b) => a.getTime() - b.getTime());
  return unpaid[0]?.toISOString() ?? null;
}

export interface ProjectEvent {
  at: Date;
  kind: "created" | "stage" | "drawing" | "payment" | "status" | "comm";
  title: string;
  detail?: string;
  amount?: string; // receipts (sell-side ₹; visible to all)
}

/**
 * Merged project-execution timeline (spec §7.3) — the richest execution history
 * in the app, previously invisible. Combines: created → completed stages (with
 * delay reasons) → drawing revisions → payments received → lifecycle status
 * changes. Newest-first. RBAC via requireProjectAccess (team-scoped for EMPLOYEE).
 */
export async function orderActivity(ctx: Ctx, id: string): Promise<ProjectEvent[] | null> {
  await requireProjectAccess(ctx, id);
  const order = await prisma.order.findFirst({
    where: { id, companyId: ctx.companyId, deletedAt: null },
    include: {
      proposal: { select: { number: true } },
      stages: { where: { actualDate: { not: null } }, select: { name: true, actualDate: true, delayReason: true } },
      drawings: { select: { title: true, revision: true, discipline: true, createdAt: true, approvalStatus: true } },
      milestones: { select: { description: true, receipts: { select: { amount: true, date: true, mode: true } } } },
      communications: { select: { channel: true, direction: true, body: true, sentStatus: true, createdAt: true } },
    },
  });
  if (!order) return null;

  const events: ProjectEvent[] = [];
  events.push({
    at: order.createdAt,
    kind: "created",
    title: "Project created",
    detail: order.proposal ? `from proposal ${order.proposal.number}` : undefined,
  });

  for (const s of order.stages) {
    events.push({
      at: s.actualDate!,
      kind: "stage",
      title: `Stage completed: ${s.name}`,
      detail: s.delayReason ? `delayed — ${s.delayReason}` : undefined,
    });
  }
  for (const d of order.drawings) {
    events.push({
      at: d.createdAt,
      kind: "drawing",
      title: `${d.title} · rev ${d.revision}`,
      detail: `${d.discipline} · ${d.approvalStatus.replace(/_/g, " ").toLowerCase()}`,
    });
  }
  for (const m of order.milestones) {
    for (const r of m.receipts) {
      events.push({
        at: r.date,
        kind: "payment",
        title: "Payment received",
        detail: `${r.mode} · ${m.description}`,
        amount: formatINR(r.amount.toString()),
      });
    }
  }

  for (const c of order.communications) {
    const chan = c.channel.charAt(0) + c.channel.slice(1).toLowerCase();
    const dir = c.direction === "IN" ? "inbound" : "outbound";
    const status = c.sentStatus && c.sentStatus !== "SENT" ? ` · ${c.sentStatus.toLowerCase()}` : "";
    events.push({
      at: c.createdAt,
      kind: "comm",
      title: `${chan} · ${dir}${status}`,
      detail: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
    });
  }

  const audits = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, entity: "Order", entityId: id, action: "UPDATE" },
    orderBy: { createdAt: "desc" },
  });
  for (const a of audits) {
    const after = (a.after ?? {}) as Record<string, unknown>;
    if ("status" in after) {
      events.push({ at: a.createdAt, kind: "status", title: `Status → ${String(after.status).replace(/_/g, " ")}` });
    }
  }

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return events;
}

/** Attach an already-uploaded document to a project (the generic Document model). */
export async function addOrderDocument(ctx: Ctx, orderId: string, doc: { url: string; name: string }) {
  await requireProjectAccess(ctx, orderId);
  const created = await prisma.document.create({
    data: { orderId, title: doc.name, fileUrl: doc.url, uploadedById: ctx.userId },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Document", entityId: created.id, after: { orderId, name: doc.name } });
  return created;
}

export async function deleteOrderDocument(ctx: Ctx, docId: string) {
  const d = await prisma.document.findFirst({ where: { id: docId, order: { companyId: ctx.companyId } } });
  if (!d) throw new Error("Document not found");
  await requireProjectAccess(ctx, d.orderId);
  await prisma.document.delete({ where: { id: docId } });
  await logAudit(ctx, { action: "DELETE", entity: "Document", entityId: docId, before: { name: d.title } });
  return { ok: true };
}

/** Resolve the project's client contact (name/phone/email) via order → proposal → lead. */
async function projectContact(ctx: Ctx, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: ctx.companyId, deletedAt: null },
    select: { clientName: true, proposal: { select: { lead: { select: { phone: true, email: true } } } } },
  });
  if (!order) throw new Error("Project not found");
  return { name: order.clientName, phone: order.proposal.lead.phone, email: order.proposal.lead.email };
}

export interface LogProjectCommInput {
  orderId: string;
  channel: "CALL" | "WHATSAPP" | "EMAIL";
  direction?: "OUT" | "IN";
  body: string;
  toAddress?: string;
  subject?: string;
  sentStatus?: string;
}

/** Record a communication (a touch) against a project — the log path (no send). */
export async function logProjectComm(ctx: Ctx, input: LogProjectCommInput) {
  await requireProjectAccess(ctx, input.orderId);
  if (!input.body.trim()) throw new Error("Message cannot be empty");
  const comm = await prisma.communication.create({
    data: {
      companyId: ctx.companyId,
      orderId: input.orderId,
      channel: input.channel,
      direction: input.direction ?? "OUT",
      body: input.body,
      toAddress: input.toAddress,
      subject: input.subject,
      sentStatus: input.sentStatus ?? "LOGGED",
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Communication", entityId: comm.id, after: { orderId: input.orderId, channel: input.channel } });
  return comm;
}

/**
 * Send a WhatsApp to the project's client and log it. Send is gated (no-op →
 * LOGGED when no transport configured); the log always records the touch.
 * ⚠️ Live delivery needs a WhatsApp token (untested here).
 */
export async function sendProjectWhatsApp(ctx: Ctx, orderId: string, body: string) {
  await requireProjectAccess(ctx, orderId);
  if (!body.trim()) throw new Error("Message cannot be empty");
  const contact = await projectContact(ctx, orderId);
  const res = await sendWhatsAppText(contact.phone, body);
  const sentStatus = res.sent ? "SENT" : res.transport === "none" ? "LOGGED" : "FAILED";
  const comm = await logProjectComm(ctx, { orderId, channel: "WHATSAPP", direction: "OUT", body, toAddress: contact.phone, sentStatus });
  return { comm, delivery: res };
}

/** Send an email to the project's client and log it. Send gated (Resend); log always records. */
export async function sendProjectEmail(ctx: Ctx, orderId: string, subject: string, body: string) {
  await requireProjectAccess(ctx, orderId);
  const contact = await projectContact(ctx, orderId);
  if (!contact.email) throw new Error("This project's client has no email address");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and message are required");
  const html = `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`;
  const res = await sendEmail({ to: contact.email, subject, html });
  const sentStatus = res.sent ? "SENT" : "LOGGED";
  const comm = await logProjectComm(ctx, { orderId, channel: "EMAIL", direction: "OUT", body, subject, toAddress: contact.email, sentStatus });
  return { comm, delivery: res };
}

/** Archive (soft-delete) a project — admin only, audited. Reversible via DB (deletedAt=null). */
export async function archiveOrder(ctx: Ctx, orderId: string) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId, deletedAt: null } });
  if (!order) throw new Error("Project not found");
  await prisma.order.update({ where: { id: orderId }, data: { deletedAt: new Date() } });
  await logAudit(ctx, { action: "UPDATE", entity: "Order", entityId: orderId, after: { archived: true } });
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function getOrder(ctx: Ctx, id: string) {
  await requireProjectAccess(ctx, id);
  const order = await prisma.order.findFirst({
    where: { id, companyId: ctx.companyId, deletedAt: null },
    include: {
      stages: { orderBy: { seq: "asc" }, include: { photos: true } },
      drawings: { orderBy: [{ title: "asc" }, { createdAt: "desc" }] },
      milestones: { orderBy: { seq: "asc" }, include: { receipts: true, invoice: true } },
      team: true,
      budget: true,
      documents: { orderBy: { createdAt: "desc" } },
      siteLocation: true,
      proposal: { select: { id: true, number: true, lead: { select: { email: true } } } },
    },
  });
  if (!order) return null;
  const progress = progressOf(order.stages);
  return { ...stripPricing(order, ctx.role), progress };
}

export async function updateStage(
  ctx: Ctx,
  stageId: string,
  data: { status?: "PENDING" | "IN_PROGRESS" | "DONE"; actualDate?: Date; notes?: string; delayReason?: string; plannedDate?: Date | null },
) {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, include: { order: true } });
  if (!stage) throw new Error("Stage not found");
  await requireProjectAccess(ctx, stage.orderId);

  // Planned date exceeded requires a delay reason.
  const willBeLate =
    stage.plannedDate && data.status !== "DONE" && new Date() > stage.plannedDate;
  if (willBeLate && !data.delayReason && !stage.delayReason) {
    throw new Error("This stage is past its planned date — a delay reason is required");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.stage.update({
      where: { id: stageId },
      data: {
        status: data.status,
        actualDate: data.status === "DONE" ? data.actualDate ?? new Date() : data.actualDate,
        notes: data.notes,
        delayReason: data.delayReason,
        ...(data.plannedDate !== undefined ? { plannedDate: data.plannedDate } : {}),
      },
    });
    // Stage completion can flip STAGE_COMPLETION milestones to DUE.
    if (data.status === "DONE") {
      await recomputeMilestones(tx, stage.orderId);
    }
    await logAudit(ctx, { action: "UPDATE", entity: "Stage", entityId: stageId, after: { status: data.status } }, tx);
    return s;
  });

  // A5 — event-driven: auto-draft the invoice for any STAGE_COMPLETION milestone now due
  // + notify admin. Best-effort — never fail the stage update on an automation error.
  if (data.status === "DONE") {
    try {
      const { onStageCompleted } = await import("@/server/automations/stage-milestone-trigger");
      await onStageCompleted(ctx, stageId);
    } catch {
      /* automation is best-effort */
    }
  }
  // A9 — a recorded delay reason closes any open stage-delay task.
  if (data.delayReason) {
    await prisma.automationTask.updateMany({
      where: { companyId: ctx.companyId, type: "STAGE_DELAY", entityId: stageId, status: "OPEN" },
      data: { status: "DONE" },
    });
  }
  return updated;
}

export async function addStagePhoto(
  ctx: Ctx,
  stageId: string,
  photo: { url: string; lat?: number; lng?: number },
) {
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw new Error("Stage not found");
  await requireProjectAccess(ctx, stage.orderId);
  return prisma.stagePhoto.create({
    data: { stageId, url: photo.url, lat: photo.lat, lng: photo.lng, byUserId: ctx.userId },
  });
}

/**
 * Drawing upload with revision control (spec §7.3): re-uploading the same title
 * marks the previous revision SUPERSEDED + isCurrent=false and bumps the letter.
 */
export async function addDrawing(
  ctx: Ctx,
  orderId: string,
  data: { title: string; discipline: string; fileUrl: string; changeNote?: string },
) {
  await requireProjectAccess(ctx, orderId);
  return prisma.$transaction(async (tx) => {
    const prev = await tx.drawing.findFirst({
      where: { orderId, title: data.title, isCurrent: true },
      orderBy: { createdAt: "desc" },
    });
    let revision = "A";
    if (prev) {
      revision = String.fromCharCode(prev.revision.charCodeAt(0) + 1);
      await tx.drawing.update({
        where: { id: prev.id },
        data: { isCurrent: false, approvalStatus: "SUPERSEDED" },
      });
    }
    const d = await tx.drawing.create({
      data: {
        orderId,
        title: data.title,
        discipline: data.discipline,
        revision,
        fileUrl: data.fileUrl,
        changeNote: data.changeNote,
        uploadedById: ctx.userId,
        isCurrent: true,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "Drawing", entityId: d.id, after: { revision } }, tx);
    return d;
  });
}

export async function setDrawingApproval(
  ctx: Ctx,
  drawingId: string,
  status: "DRAFT" | "FOR_APPROVAL" | "APPROVED",
) {
  requireAdmin(ctx);
  const drawing = await prisma.drawing.findFirst({
    where: { id: drawingId, order: { companyId: ctx.companyId } },
  });
  if (!drawing) throw new Error("Drawing not found");
  const updated = await prisma.drawing.update({ where: { id: drawingId }, data: { approvalStatus: status } });
  await logAudit(ctx, { action: "UPDATE", entity: "Drawing", entityId: drawingId, after: { approvalStatus: status } });
  return updated;
}

export async function assignTeam(ctx: Ctx, orderId: string, userId: string, role: string) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId, deletedAt: null } });
  if (!order) throw new Error("Project not found");
  const assignment = await prisma.teamAssignment.upsert({
    where: { orderId_userId: { orderId, userId } },
    update: { role },
    create: { orderId, userId, role },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "TeamAssignment", entityId: assignment.id, after: { orderId, userId, role } });
  return assignment;
}

/** Set the customer's place-of-supply state + GSTIN on a project (drives invoice IGST). Admin, audited. */
export async function setOrderGst(ctx: Ctx, orderId: string, data: { clientStateCode?: string | null; clientGstin?: string | null }) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId, deletedAt: null } });
  if (!order) throw new Error("Project not found");
  const gstin = data.clientGstin?.trim().toUpperCase() || null;
  let stateCode = data.clientStateCode?.trim() || null;
  // A GSTIN's first two characters ARE the state code (GST rule) — derive it when the
  // state code wasn't entered explicitly, so place-of-supply is never left ambiguous.
  if (!stateCode && gstin && /^\d{2}/.test(gstin)) stateCode = gstin.slice(0, 2);
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { clientStateCode: stateCode, clientGstin: gstin },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "Order", entityId: orderId, after: { clientStateCode: updated.clientStateCode, clientGstin: updated.clientGstin } });
  return { ok: true };
}

/**
 * Reschedule a project's start / target-completion dates. Admin only, audited.
 * Either date may be cleared (null) or set; a target before the start is rejected.
 */
export async function setOrderSchedule(
  ctx: Ctx,
  orderId: string,
  data: { startDate?: Date | null; targetDate?: Date | null },
) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId, deletedAt: null } });
  if (!order) throw new Error("Project not found");

  const nextStart = data.startDate !== undefined ? data.startDate : order.startDate;
  const nextTarget = data.targetDate !== undefined ? data.targetDate : order.targetDate;
  if (nextStart && nextTarget && nextTarget < nextStart) {
    throw new Error("Target completion cannot be before the start date");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
      ...(data.targetDate !== undefined ? { targetDate: data.targetDate } : {}),
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Order",
    entityId: orderId,
    before: { startDate: order.startDate, targetDate: order.targetDate },
    after: { startDate: updated.startDate, targetDate: updated.targetDate },
  });
  return { ok: true };
}

/**
 * Revise the estimated project value. Admin only; a reason is REQUIRED and logged
 * with the before/after so the change is traceable (it moves gross-margin and the
 * budget-variance % shown on the project). Budget base is untouched.
 */
export async function setOrderValue(
  ctx: Ctx,
  orderId: string,
  data: { projectValue: string; reason: string },
) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId, deletedAt: null } });
  if (!order) throw new Error("Project not found");

  const reason = data.reason?.trim();
  if (!reason) throw new Error("A reason for the change is required");
  let value: Decimal;
  try {
    value = new Decimal(data.projectValue);
  } catch {
    throw new Error("Invalid amount");
  }
  if (value.lte(0)) throw new Error("Project value must be greater than zero");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { projectValue: value.toFixed(2) },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Order",
    entityId: orderId,
    before: { projectValue: order.projectValue.toString() },
    after: { projectValue: updated.projectValue.toString(), reason },
  });
  return { ok: true };
}

/** Remove a team member from a project — admin only, audited. */
export async function removeTeam(ctx: Ctx, orderId: string, userId: string) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId } });
  if (!order) throw new Error("Project not found");
  const existing = await prisma.teamAssignment.findUnique({ where: { orderId_userId: { orderId, userId } } });
  if (!existing) throw new Error("Assignment not found");
  await prisma.teamAssignment.delete({ where: { orderId_userId: { orderId, userId } } });
  await logAudit(ctx, { action: "DELETE", entity: "TeamAssignment", entityId: existing.id, before: { orderId, userId, role: existing.role } });
  return { ok: true };
}

/**
 * Set a milestone's schedule — due date and/or linked stage. Admin only, audited.
 * These fields drive the receivables cron (DATE trigger) and the STAGE_COMPLETION
 * trigger; both were inert while unset. Recomputes status afterwards.
 */
export async function setMilestoneSchedule(
  ctx: Ctx,
  milestoneId: string,
  data: { dueDate?: Date | null; linkedStageId?: string | null },
) {
  requireAdmin(ctx);
  const milestone = await prisma.paymentMilestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) throw new Error("Milestone not found");
  await requireProjectAccess(ctx, milestone.orderId);
  if (data.linkedStageId) {
    const stage = await prisma.stage.findFirst({ where: { id: data.linkedStageId, orderId: milestone.orderId } });
    if (!stage) throw new Error("Linked stage must belong to this project");
  }
  return prisma.$transaction(async (tx) => {
    await tx.paymentMilestone.update({
      where: { id: milestoneId },
      data: {
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.linkedStageId !== undefined ? { linkedStageId: data.linkedStageId } : {}),
      },
    });
    await recomputeMilestones(tx, milestone.orderId);
    await logAudit(ctx, { action: "UPDATE", entity: "PaymentMilestone", entityId: milestoneId, after: { dueDate: data.dueDate ?? null, linkedStageId: data.linkedStageId ?? null } }, tx);
    return { ok: true };
  });
}

/** Admin records a receipt against a milestone; milestone status recomputed. */
export async function addReceipt(
  ctx: Ctx,
  milestoneId: string,
  data: { date: Date; amount: number; mode: string; refNo?: string; note?: string },
) {
  requireAdmin(ctx);
  const amt = new Decimal(data.amount);
  if (amt.lte(0)) throw new Error("Receipt amount must be positive");
  return prisma.$transaction(async (tx) => {
    // Read balance and write receipt inside the same transaction — prevents two concurrent
    // submissions from both passing the guard on the same starting balance (TOCTOU race).
    const milestone = await tx.paymentMilestone.findFirst({
      where: { id: milestoneId, order: { companyId: ctx.companyId } },
      include: { receipts: { select: { amount: true } } },
    });
    if (!milestone) throw new Error("Milestone not found");
    const paid = milestone.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
    const outstanding = new Decimal(milestone.amount).minus(paid);
    if (amt.gt(outstanding)) throw new Error(`Receipt ₹${amt.toFixed(2)} exceeds the outstanding balance ₹${outstanding.toFixed(2)}`);
    const r = await tx.receipt.create({
      data: {
        milestoneId,
        date: data.date,
        amount: amt.toFixed(2),
        mode: data.mode,
        refNo: data.refNo,
        note: data.note,
        createdById: ctx.userId,
      },
    });
    await recomputeMilestones(tx, milestone.orderId);
    await logAudit(ctx, { action: "CREATE", entity: "Receipt", entityId: r.id, after: { amount: data.amount } }, tx);
    return { ok: true };
  });
}

/** Recompute all milestone statuses for an order from receipts + linked stage. */
export async function recomputeMilestones(tx: Prisma.TransactionClient, orderId: string) {
  const milestones = await tx.paymentMilestone.findMany({
    where: { orderId },
    include: { receipts: true },
  });

  // Batch-load all linked stages in one query instead of one per milestone (N+1 fix).
  const linkedIds = milestones.map((m) => m.linkedStageId).filter((id): id is string => !!id);
  const stageStatusMap = new Map<string, StageStatus>();
  if (linkedIds.length > 0) {
    const stages = await tx.stage.findMany({
      where: { id: { in: linkedIds } },
      select: { id: true, status: true },
    });
    for (const s of stages) stageStatusMap.set(s.id, s.status);
  }

  for (const m of milestones) {
    const linkedStageStatus = m.linkedStageId ? (stageStatusMap.get(m.linkedStageId) ?? null) : null;
    const status = computeMilestoneStatus(
      {
        amount: m.amount,
        dueBasis: m.dueBasis as "DATE" | "STAGE_COMPLETION",
        dueDate: m.dueDate,
        linkedStageStatus,
      },
      m.receipts.map((r) => ({ amount: r.amount })),
    );
    if (status !== m.status) {
      await tx.paymentMilestone.update({ where: { id: m.id }, data: { status } });
    }
  }
}
