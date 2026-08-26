import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { hasCapability, CAPABILITIES, type CapabilityCtx } from "@/lib/rbac";
import { AuthError, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAutomationTask } from "@/server/automations/util";
import { addDrawing } from "./order";
import { DRAWING_DISCIPLINES, DRAWING_PRIORITIES, DEFAULT_DRAWING_SLA_DAYS } from "@/lib/constants";

/**
 * DRAWING REQUESTS — the AutoCAD request→deliver→accept loop.
 *
 * Green Ecocare's own proposal commits to "civil drawings with all details within 10
 * days from the date of the P.O.", so a drawing is a contractual deliverable with an
 * SLA. This module makes that trackable: who asked, for what, by when, and whether it
 * landed — instead of a file that appears on a project with no story attached.
 *
 * ## Access model
 *
 * Deliberately three-tiered, because "who may see a drawing" and "who may produce one"
 * are different questions:
 *   • **Raise / deliver** — the `DRAWINGS` capability (admins hold it implicitly).
 *     Granted per user in Settings → Users.
 *   • **See a request** — admins and DRAWINGS holders see the whole queue; anyone else
 *     sees only requests they raised themselves.
 *   • **View a delivered drawing** — unchanged from before: `requireProjectAccess` on a
 *     project drawing, so site staff can still open the layout they're building from
 *     WITHOUT the capability. Standalone drawings (no project) need the capability,
 *     since there's no team membership to check against.
 *
 * A request can name a won project, an enquiry still being quoted, or neither — all
 * three are `null`-able and independent. Tenant scope is always `companyId`.
 */

// Defined in lib/constants.ts so client components can import them without dragging
// this service's `web-push` dependency into the browser bundle. Re-exported here for
// server-side callers that already import from this module.
export { DRAWING_DISCIPLINES, DRAWING_PRIORITIES, DEFAULT_DRAWING_SLA_DAYS };

const createSchema = z
  .object({
    title: z.string().trim().min(1, "Say what needs to be drawn").max(200),
    discipline: z.enum(DRAWING_DISCIPLINES),
    orderId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    purpose: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(4000).optional(),
    dueDate: z.coerce.date().optional(),
    priority: z.enum(DRAWING_PRIORITIES).default("NORMAL"),
    assignedToId: z.string().min(1).optional(),
  })
  .refine((v) => !(v.orderId && v.leadId), {
    message: "A request can name a project or an enquiry, not both",
    path: ["orderId"],
  });

export type CreateDrawingRequestInput = z.input<typeof createSchema>;

function requireDrawings(ctx: CapabilityCtx) {
  if (!hasCapability(ctx, CAPABILITIES.DRAWINGS)) {
    throw new AuthError(
      "You don't have drawing access. Ask an admin to enable it in Settings → Users.",
      403,
    );
  }
}

/** Raise a request. Needs the DRAWINGS capability; audited; notifies the drawing team. */
export async function createDrawingRequest(ctx: CapabilityCtx, input: CreateDrawingRequestInput) {
  requireDrawings(ctx);
  const data = createSchema.parse(input);

  // Tenant-check whatever the caller attached it to — never trust a supplied id.
  // (This is the cross-tenant write the materials module shipped with in v27.)
  if (data.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, companyId: ctx.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new Error("Project not found");
  }
  if (data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, companyId: ctx.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new Error("Enquiry not found");
  }
  if (data.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedToId, companyId: ctx.companyId, active: true },
      select: { id: true },
    });
    if (!assignee) throw new Error("Assignee not found");
  }

  const dueDate = data.dueDate ?? defaultDueDate();

  const req = await prisma.drawingRequest.create({
    data: {
      companyId: ctx.companyId,
      orderId: data.orderId ?? null,
      leadId: data.leadId ?? null,
      title: data.title,
      discipline: data.discipline,
      purpose: data.purpose,
      notes: data.notes,
      dueDate,
      priority: data.priority,
      assignedToId: data.assignedToId ?? null,
      requestedById: ctx.userId,
      status: data.assignedToId ? "IN_PROGRESS" : "OPEN",
    },
  });
  await logAudit(ctx, {
    action: "CREATE",
    entity: "DrawingRequest",
    entityId: req.id,
    after: { title: req.title, discipline: req.discipline, orderId: req.orderId, leadId: req.leadId },
  });

  await notifyDrawingTeam(ctx, {
    type: "DRAWING_REQUESTED",
    title: `Drawing requested: ${req.title}`,
    entityId: req.id,
    dueDate,
    // If it's already assigned, only that person needs to know.
    onlyUserId: req.assignedToId ?? undefined,
  });

  return req;
}

/** +10 days, matching the commitment the proposal document already makes. */
function defaultDueDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_DRAWING_SLA_DAYS);
  return d;
}

/** Everyone who can act on a drawing request: admins + DRAWINGS capability holders. */
async function drawingTeam(companyId: string): Promise<{ id: string }[]> {
  return prisma.user.findMany({
    where: {
      companyId,
      active: true,
      OR: [{ role: "ADMIN" }, { capabilities: { has: CAPABILITIES.DRAWINGS } }],
    },
    select: { id: true },
  });
}

async function notifyDrawingTeam(
  ctx: Ctx,
  task: { type: string; title: string; entityId: string; dueDate?: Date | null; onlyUserId?: string },
) {
  const recipients = task.onlyUserId
    ? [{ id: task.onlyUserId }]
    : await drawingTeam(ctx.companyId);
  // Best-effort: a notification failure must never fail the action that triggered it.
  await Promise.all(
    recipients
      .filter((r) => r.id !== ctx.userId)
      .map((r) =>
        createAutomationTask({
          companyId: ctx.companyId,
          type: task.type,
          title: task.title,
          entity: "DrawingRequest",
          entityId: task.entityId,
          assigneeId: r.id,
          dueDate: task.dueDate,
          href: "/drawings",
        }).catch(() => {}),
      ),
  );
}

export interface DrawingRequestFilters {
  status?: string;
  /** "mine" = raised by me, "assigned" = assigned to me, "overdue" = past due and open. */
  view?: string;
  search?: string;
  cursor?: string;
  take?: number;
}

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "CHANGES_REQUESTED"] as const;

/**
 * The request queue. Admins and DRAWINGS holders see everything; anyone else sees only
 * what they raised — so an employee without the capability can still track a request
 * they made before it was revoked, but can't browse the whole workload.
 */
export async function listDrawingRequests(ctx: CapabilityCtx, filters: DrawingRequestFilters = {}) {
  const take = Math.min(filters.take ?? 25, 100);
  const canSeeAll = hasCapability(ctx, CAPABILITIES.DRAWINGS);

  const and: Prisma.DrawingRequestWhereInput[] = [];
  if (!canSeeAll) and.push({ requestedById: ctx.userId });
  if (filters.view === "mine") and.push({ requestedById: ctx.userId });
  if (filters.view === "assigned") and.push({ assignedToId: ctx.userId });
  if (filters.view === "overdue") {
    and.push({ dueDate: { lt: new Date() }, status: { in: [...OPEN_STATUSES] } });
  }
  if (filters.search) {
    and.push({
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { purpose: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.DrawingRequestWhereInput = {
    companyId: ctx.companyId,
    ...(filters.status === "open"
      ? { status: { in: [...OPEN_STATUSES] } }
      : filters.status
        ? { status: filters.status as Prisma.EnumDrawingRequestStatusFilter["equals"] }
        : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const rows = await prisma.drawingRequest.findMany({
    where,
    include: {
      order: { select: { id: true, orderNo: true, clientName: true } },
      lead: { select: { id: true, customerName: true } },
      drawings: {
        where: { isCurrent: true },
        select: { id: true, revision: true, fileUrl: true, approvalStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    // Overdue first, then soonest due, then newest.
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  // `overdue` is derived HERE, not in the page. A Date.now() inside a component's
  // render is impure (react-hooks/purity) and risks an SSR/hydration mismatch — the
  // same lesson the projects list learned in v17.
  const now = Date.now();
  const items = page.map((r) => ({
    ...r,
    overdue:
      !!r.dueDate &&
      r.dueDate.getTime() < now &&
      (OPEN_STATUSES as readonly string[]).includes(r.status),
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getDrawingRequest(ctx: CapabilityCtx, id: string) {
  const canSeeAll = hasCapability(ctx, CAPABILITIES.DRAWINGS);
  return prisma.drawingRequest.findFirst({
    where: {
      id,
      companyId: ctx.companyId,
      ...(canSeeAll ? {} : { requestedById: ctx.userId }),
    },
    include: {
      order: { select: { id: true, orderNo: true, clientName: true } },
      lead: { select: { id: true, customerName: true } },
      drawings: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** KPI counts for the module header + the sidebar badge. Role-scoped like the list. */
export async function drawingStats(ctx: CapabilityCtx) {
  const canSeeAll = hasCapability(ctx, CAPABILITIES.DRAWINGS);
  const scope: Prisma.DrawingRequestWhereInput = {
    companyId: ctx.companyId,
    ...(canSeeAll ? {} : { requestedById: ctx.userId }),
  };
  const [open, awaitingMe, overdue, completed] = await Promise.all([
    prisma.drawingRequest.count({ where: { ...scope, status: { in: [...OPEN_STATUSES] } } }),
    prisma.drawingRequest.count({ where: { ...scope, status: "DELIVERED", requestedById: ctx.userId } }),
    prisma.drawingRequest.count({
      where: { ...scope, status: { in: [...OPEN_STATUSES] }, dueDate: { lt: new Date() } },
    }),
    prisma.drawingRequest.count({ where: { ...scope, status: "COMPLETED" } }),
  ]);
  return { open, awaitingMe, overdue, completed };
}

/** Bare count for the nav badge — never pays for the full stats query. */
export async function openDrawingRequestCount(ctx: CapabilityCtx): Promise<number> {
  const canSeeAll = hasCapability(ctx, CAPABILITIES.DRAWINGS);
  return prisma.drawingRequest.count({
    where: {
      companyId: ctx.companyId,
      status: { in: [...OPEN_STATUSES] },
      ...(canSeeAll ? {} : { requestedById: ctx.userId }),
    },
  });
}

async function loadForAction(ctx: CapabilityCtx, id: string) {
  const req = await prisma.drawingRequest.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!req) throw new Error("Drawing request not found");
  return req;
}

/** Take a request on (or hand it to someone else). Needs the capability. */
export async function assignDrawingRequest(ctx: CapabilityCtx, id: string, assignedToId: string | null) {
  requireDrawings(ctx);
  const req = await loadForAction(ctx, id);
  if (assignedToId) {
    const user = await prisma.user.findFirst({
      where: { id: assignedToId, companyId: ctx.companyId, active: true },
      select: { id: true },
    });
    if (!user) throw new Error("Assignee not found");
  }
  const updated = await prisma.drawingRequest.update({
    where: { id },
    data: {
      assignedToId,
      // Picking it up moves an untouched request into progress; unassigning returns it
      // to the pool. A request already delivered/completed keeps its status.
      status:
        req.status === "OPEN" && assignedToId
          ? "IN_PROGRESS"
          : req.status === "IN_PROGRESS" && !assignedToId
            ? "OPEN"
            : req.status,
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "DrawingRequest",
    entityId: id,
    before: { assignedToId: req.assignedToId, status: req.status },
    after: { assignedToId, status: updated.status },
  });
  if (assignedToId && assignedToId !== ctx.userId) {
    await notifyDrawingTeam(ctx, {
      type: "DRAWING_ASSIGNED",
      title: `Drawing assigned to you: ${req.title}`,
      entityId: id,
      dueDate: req.dueDate,
      onlyUserId: assignedToId,
    }).catch(() => {});
  }
  return updated;
}

/**
 * Deliver a drawing against a request.
 *
 * The file goes through the EXISTING `addDrawing` revision engine — so a re-delivery
 * after "request changes" automatically becomes Rev B and supersedes Rev A, with no
 * second revision implementation to drift. The request's title is used as the drawing
 * title, which is what keys the revision chain.
 */
export async function deliverDrawing(
  ctx: CapabilityCtx,
  id: string,
  file: { fileUrl: string; changeNote?: string },
) {
  requireDrawings(ctx);
  const req = await loadForAction(ctx, id);
  if (req.status === "COMPLETED") throw new Error("This request is already completed");
  if (req.status === "CANCELLED") throw new Error("This request was cancelled");

  const drawing = await addDrawing(ctx, req.orderId, {
    title: req.title,
    discipline: req.discipline,
    fileUrl: file.fileUrl,
    changeNote: file.changeNote,
    requestId: req.id,
  });

  const updated = await prisma.drawingRequest.update({
    where: { id },
    data: { status: "DELIVERED", changeReason: null },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "DrawingRequest",
    entityId: id,
    before: { status: req.status },
    after: { status: "DELIVERED", drawingId: drawing.id, revision: drawing.revision },
  });

  await notifyDrawingTeam(ctx, {
    type: "DRAWING_DELIVERED",
    title: `Drawing ready: ${req.title} (Rev ${drawing.revision})`,
    entityId: id,
    onlyUserId: req.requestedById,
  });

  return { request: updated, drawing };
}

/**
 * The requester's verdict on a delivered drawing.
 *
 * `CHANGES_REQUESTED` reopens the request with a reason — the next `deliverDrawing`
 * then produces Rev B through the same engine, so the correction is linked to the
 * drawing that caused it instead of becoming an unrelated new request.
 */
export async function reviewDelivery(
  ctx: CapabilityCtx,
  id: string,
  verdict: "ACCEPT" | "REQUEST_CHANGES",
  changeReason?: string,
) {
  const req = await loadForAction(ctx, id);
  // The person who asked for it decides — plus admins, who can unblock a stalled
  // request when the requester is unavailable.
  if (req.requestedById !== ctx.userId && ctx.role !== "ADMIN") {
    throw new AuthError("Only the person who requested this drawing can review it", 403);
  }
  if (req.status !== "DELIVERED") throw new Error("There is nothing delivered to review");
  if (verdict === "REQUEST_CHANGES" && !changeReason?.trim()) {
    throw new Error("Say what needs changing — the reason is what the next revision works from");
  }

  const updated = await prisma.drawingRequest.update({
    where: { id },
    data:
      verdict === "ACCEPT"
        ? { status: "COMPLETED", closedAt: new Date(), changeReason: null }
        : { status: "CHANGES_REQUESTED", changeReason: changeReason!.trim() },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "DrawingRequest",
    entityId: id,
    before: { status: req.status },
    after: { status: updated.status, changeReason: updated.changeReason },
  });

  await notifyDrawingTeam(ctx, {
    type: verdict === "ACCEPT" ? "DRAWING_ACCEPTED" : "DRAWING_CHANGES_REQUESTED",
    title:
      verdict === "ACCEPT"
        ? `Drawing accepted: ${req.title}`
        : `Changes requested: ${req.title} — ${changeReason!.trim()}`,
    entityId: id,
    onlyUserId: req.assignedToId ?? undefined,
  });

  return updated;
}

/** Withdraw a request. The requester or an admin; a completed one stays completed. */
export async function cancelDrawingRequest(ctx: CapabilityCtx, id: string, reason?: string) {
  const req = await loadForAction(ctx, id);
  if (req.requestedById !== ctx.userId && ctx.role !== "ADMIN") {
    throw new AuthError("Only the person who requested this drawing can cancel it", 403);
  }
  if (req.status === "COMPLETED") throw new Error("A completed request can't be cancelled");
  const updated = await prisma.drawingRequest.update({
    where: { id },
    data: { status: "CANCELLED", closedAt: new Date(), changeReason: reason?.trim() || null },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "DrawingRequest",
    entityId: id,
    before: { status: req.status },
    after: { status: "CANCELLED" },
  });
  return updated;
}

/** Reopen a cancelled request rather than making the requester retype it. */
export async function reopenDrawingRequest(ctx: CapabilityCtx, id: string) {
  requireDrawings(ctx);
  const req = await loadForAction(ctx, id);
  if (req.status !== "CANCELLED") throw new Error("Only a cancelled request can be reopened");
  const updated = await prisma.drawingRequest.update({
    where: { id },
    data: { status: req.assignedToId ? "IN_PROGRESS" : "OPEN", closedAt: null, changeReason: null },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "DrawingRequest", entityId: id, after: { status: updated.status } });
  return updated;
}

export interface DrawingLibraryFilters {
  search?: string;
  discipline?: string;
  /** Include superseded revisions — the history the projects tab hides. */
  includeHistory?: boolean;
  cursor?: string;
  take?: number;
}

/**
 * The drawing library — every drawing in the company, with revision history.
 *
 * The projects tab filters to `isCurrent`, so Rev A became invisible the moment Rev B
 * landed. Here history is opt-in and visible.
 *
 * Scope: admins and DRAWINGS holders see all; everyone else sees drawings on projects
 * they're assigned to (site staff must be able to open the layout they build from) —
 * standalone drawings need the capability, since there's no team to check.
 */
export async function listDrawings(ctx: CapabilityCtx, filters: DrawingLibraryFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const canSeeAll = hasCapability(ctx, CAPABILITIES.DRAWINGS);

  const where: Prisma.DrawingWhereInput = {
    companyId: ctx.companyId,
    ...(filters.includeHistory ? {} : { isCurrent: true }),
    ...(filters.discipline ? { discipline: filters.discipline } : {}),
    ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
    ...(canSeeAll
      ? {}
      : { order: { team: { some: { userId: ctx.userId } } } }),
  };

  const rows = await prisma.drawing.findMany({
    where,
    include: {
      order: { select: { id: true, orderNo: true, clientName: true } },
      request: { select: { id: true, title: true, status: true } },
    },
    orderBy: [{ title: "asc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Every revision of one drawing title, newest first — the history the old UI hid. */
export async function drawingRevisions(ctx: CapabilityCtx, drawingId: string) {
  const anchor = await prisma.drawing.findFirst({
    where: { id: drawingId, companyId: ctx.companyId },
    select: { title: true, orderId: true },
  });
  if (!anchor) return null;
  // Scope mirrors listDrawings exactly: a holder already sees every drawing in the
  // company, so gating the history on team membership left half the library's rows
  // with a history button that 403s.
  if (!hasCapability(ctx, CAPABILITIES.DRAWINGS)) {
    if (anchor.orderId) {
      const { requireProjectAccess } = await import("@/lib/auth");
      await requireProjectAccess(ctx, anchor.orderId);
    } else {
      requireDrawings(ctx);
    }
  }
  return prisma.drawing.findMany({
    where: {
      companyId: ctx.companyId,
      orderId: anchor.orderId,
      title: { equals: anchor.title, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Admins only — unchanged from the pre-existing service, now actually reachable. */
export async function setApproval(
  ctx: Ctx,
  drawingId: string,
  status: "DRAFT" | "FOR_APPROVAL" | "APPROVED",
) {
  requireAdmin(ctx);
  const { setDrawingApproval } = await import("./order");
  return setDrawingApproval(ctx, drawingId, status);
}
