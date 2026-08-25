import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAutomationTask } from "@/server/automations/util";
import { PROPOSAL_TYPES, TECHNOLOGIES, PLANT_TYPES, CAPACITY_UNITS } from "@/lib/constants";
import { hasProjectReportTemplate, PROJECT_REPORT_TECHNOLOGIES } from "@/lib/project-report-templates";
import { accessibleLead } from "./lead";

/**
 * PROPOSAL REQUESTS — the field-staff → office handoff.
 *
 * Green Ecocare's proposals are written by the office, not by whoever took the
 * enquiry. This is the request half of that: an employee raises "please quote this
 * enquiry, as a <type>", the admin picks it up and produces the document. Modelled
 * on `MaterialRequest` (materials.ts), the repo's other employee→admin request flow.
 *
 * Deliberately carries NO pricing at all — nothing here needs stripPricing, and
 * nothing in this file should ever grow a money field. Pricing lives on the
 * Proposal the admin creates from the request.
 *
 * Two bugs from the v27 materials-request work are explicitly avoided here:
 *   1. `createProposalRequest` has NO `requireAdmin` — it IS the employee path.
 *      (The materials equivalent was correct in the service but unreachable in the
 *      UI because the page mounted it under `{isAdmin && …}`. See the routes.)
 *   2. The caller-supplied `leadId` is checked for tenant AND ownership via the
 *      shared `accessibleLead` predicate — not trusted, and not re-derived here.
 */

const createSchema = z
  .object({
    leadId: z.string().min(1),
    proposalType: z.enum(PROPOSAL_TYPES),
    // Only meaningful for a Project Proposal — that's the one type with per-technology
    // document variants. Stored anyway if supplied; the create form hides it otherwise.
    technology: z.enum(TECHNOLOGIES).optional(),
  plantType: z.enum(PLANT_TYPES).optional(),
  capacityValue: z.number().positive().optional(),
  capacityUnit: z.enum(CAPACITY_UNITS).default("KLD"),
    notes: z.string().trim().max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    // A Project Proposal's whole document is technology-specific, and only four
    // technologies have one. Accepting SAFF/DAF here would record a technology whose
    // engineering content doesn't exist — the request would produce a proposal with
    // empty process/equipment/load sections and no indication why.
    if (v.proposalType === "Project Proposal" && v.technology && !hasProjectReportTemplate(v.technology)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["technology"],
        message: `There is no Project Proposal document format for ${v.technology} yet — choose ${PROJECT_REPORT_TECHNOLOGIES.join(", ")}, or request a different proposal type.`,
      });
    }
  });

export type CreateProposalRequestInput = z.input<typeof createSchema>;

/** Raise a request against an enquiry. Employee or admin; audited; notifies the office. */
export async function createProposalRequest(ctx: Ctx, input: CreateProposalRequestInput) {
  const data = createSchema.parse(input);
  // Tenant + ownership. Throws "Lead not found" for both a cross-tenant id and a
  // lead this employee has no access to — collapsed on purpose, so a probe can't
  // distinguish "exists elsewhere" from "doesn't exist".
  const lead = await accessibleLead(ctx, data.leadId);

  // One open request per (lead, type). A second one is a double-click or a
  // duplicate ask, and would just clutter the admin's queue.
  const existing = await prisma.proposalRequest.findFirst({
    where: {
      companyId: ctx.companyId,
      leadId: data.leadId,
      proposalType: data.proposalType,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`A ${data.proposalType} has already been requested for this enquiry and is still open`);
  }

  const req = await prisma.proposalRequest.create({
    data: {
      companyId: ctx.companyId,
      leadId: data.leadId,
      proposalType: data.proposalType,
      technology: data.technology ?? lead.technology,
      plantType: data.plantType ?? lead.plantType,
      capacityValue: data.capacityValue ?? lead.capacityValue ?? lead.capacityKLD,
      capacityUnit: data.capacityUnit ?? lead.capacityUnit ?? "KLD",
      notes: data.notes,
      requestedById: ctx.userId,
      status: "PENDING",
    },
  });
  await logAudit(ctx, {
    action: "CREATE",
    entity: "ProposalRequest",
    entityId: req.id,
    after: { leadId: data.leadId, proposalType: data.proposalType },
  });

  await notifyAdmins(ctx, {
    type: "PROPOSAL_REQUESTED",
    title: `${data.proposalType} requested — ${lead.customerName}`,
    entityId: req.id,
    href: `/proposals/requests`,
  });

  return req;
}

/** Every active admin in the company — the office inbox for a new request. */
async function notifyAdmins(
  ctx: Ctx,
  task: { type: string; title: string; entityId: string; href: string },
) {
  const admins = await prisma.user.findMany({
    where: { companyId: ctx.companyId, role: "ADMIN", active: true },
    select: { id: true },
  });
  // Best-effort: a notification failure must never fail the request the user just
  // raised — same rule the automation engine already applies to push.
  await Promise.all(
    admins.map((a) =>
      createAutomationTask({
        companyId: ctx.companyId,
        type: task.type,
        title: task.title,
        entity: "ProposalRequest",
        entityId: task.entityId,
        assigneeId: a.id,
        href: task.href,
      }).catch(() => {}),
    ),
  );
}

/**
 * Tell the employee who asked that their proposal is ready. Called from the
 * proposal service when an admin confirms (approves & sends) a proposal that came
 * from a request — that confirmation is also what makes it visible to them.
 */
export async function notifyRequesterOfConfirmedProposal(
  ctx: Ctx,
  proposalId: string,
  proposalNumber: string,
): Promise<void> {
  const requests = await prisma.proposalRequest.findMany({
    where: { companyId: ctx.companyId, proposalId },
    select: { requestedById: true, proposalType: true },
  });
  await Promise.all(
    requests
      // Don't ping an admin about their own confirmation.
      .filter((r) => r.requestedById !== ctx.userId)
      .map((r) =>
        createAutomationTask({
          companyId: ctx.companyId,
          type: "PROPOSAL_READY",
          title: `Your ${r.proposalType} is ready — ${proposalNumber}`,
          entity: "Proposal",
          entityId: proposalId,
          assigneeId: r.requestedById,
          href: `/proposals/${proposalId}`,
        }).catch(() => {}),
      ),
  );
}

export interface ProposalRequestFilters {
  status?: string;
  cursor?: string;
  take?: number;
}

/**
 * ADMIN sees the whole queue; EMPLOYEE sees only requests they raised — the
 * "own requests" half of their visibility. Cursor-paginated like every other
 * list in this codebase.
 */
export async function listProposalRequests(ctx: Ctx, filters: ProposalRequestFilters = {}) {
  const take = Math.min(filters.take ?? 25, 100);
  const where: Prisma.ProposalRequestWhereInput = {
    companyId: ctx.companyId,
    ...(ctx.role !== "ADMIN" ? { requestedById: ctx.userId } : {}),
    ...(filters.status
      ? { status: filters.status as Prisma.EnumProposalRequestStatusFilter["equals"] }
      : {}),
  };

  const rows = await prisma.proposalRequest.findMany({
    where,
    include: {
      lead: { select: { id: true, customerName: true, address: true, phone: true } },
      proposal: { select: { id: true, number: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getProposalRequest(ctx: Ctx, id: string) {
  const req = await prisma.proposalRequest.findFirst({
    where: {
      id,
      companyId: ctx.companyId,
      ...(ctx.role !== "ADMIN" ? { requestedById: ctx.userId } : {}),
    },
    include: {
      lead: {
        select: {
          id: true,
          customerName: true,
          address: true,
          phone: true,
          email: true,
          plantType: true,
          technology: true,
          capacityKLD: true,
          capacityValue: true,
          capacityUnit: true,
          segment: true,
        },
      },
      proposal: { select: { id: true, number: true, status: true } },
    },
  });
  return req;
}

/**
 * Admin triage: take the request on (ACCEPTED) or decline it (REJECTED, reason
 * required so the employee learns why). FULFILLED is NOT set here — it is set by
 * `convertToProposal` inside the proposal-creating transaction, so a request can
 * never read as fulfilled against a proposal that didn't commit.
 */
export async function reviewProposalRequest(
  ctx: Ctx,
  id: string,
  status: "ACCEPTED" | "REJECTED",
  rejectionReason?: string,
) {
  requireAdmin(ctx);
  if (status === "REJECTED" && !rejectionReason?.trim()) {
    throw new Error("A reason is required to reject a proposal request");
  }
  const req = await prisma.proposalRequest.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!req) throw new Error("Request not found");
  if (req.status === "FULFILLED") throw new Error("This request has already produced a proposal");

  const updated = await prisma.proposalRequest.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? rejectionReason!.trim() : null,
      reviewedById: ctx.userId,
      reviewedAt: new Date(),
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "ProposalRequest",
    entityId: id,
    before: { status: req.status },
    after: { status },
  });

  // Tell the requester either way — a rejection with a reason is the useful half.
  if (req.requestedById !== ctx.userId) {
    await createAutomationTask({
      companyId: ctx.companyId,
      type: status === "REJECTED" ? "PROPOSAL_REQUEST_REJECTED" : "PROPOSAL_REQUEST_ACCEPTED",
      title:
        status === "REJECTED"
          ? `${req.proposalType} request declined — ${rejectionReason!.trim()}`
          : `${req.proposalType} request accepted — being prepared`,
      entity: "ProposalRequest",
      entityId: id,
      assigneeId: req.requestedById,
      href: "/proposals/requests",
    }).catch(() => {});
  }

  return updated;
}

/** Pending count for the sub-nav badge. Bare count — role-scoped like the list. */
export async function pendingProposalRequestCount(ctx: Ctx): Promise<number> {
  return prisma.proposalRequest.count({
    where: {
      companyId: ctx.companyId,
      status: "PENDING",
      ...(ctx.role !== "ADMIN" ? { requestedById: ctx.userId } : {}),
    },
  });
}
