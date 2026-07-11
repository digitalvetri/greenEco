import { Prisma } from "@prisma/client";
import type { LeadStatus, FollowUpOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { boqPreview } from "@/lib/constants";
import { leadScore } from "@/lib/domain/lead-score";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { allocateNumber } from "./numbering";
import type { CreateLeadInput, UpdateLeadInput, CreateFollowUpInput } from "@/lib/validation";

const OPEN_STATUSES: LeadStatus[] = ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED"];

export type LeadUrgency = { kind: "overdue" | "no-date" | "stale-new"; label: string } | null;

/**
 * Per-lead urgency, derived (not stored) — surfaces "going cold" at the row
 * level instead of only as a filter. Only open leads can be urgent.
 *   overdue    — a scheduled follow-up's date has passed
 *   stale-new  — a NEW lead sitting un-actioned ≥ 2 days
 *   no-date    — open but with no next follow-up scheduled
 */
export function leadUrgency(lead: {
  status: string;
  createdAt: Date | string;
  followUps: { nextDate: Date | string | null }[];
}): LeadUrgency {
  if (!OPEN_STATUSES.includes(lead.status as LeadStatus)) return null;
  const now = Date.now();
  const nextRaw = lead.followUps[0]?.nextDate;
  const next = nextRaw ? new Date(nextRaw).getTime() : null;

  if (next && next < now) {
    const days = Math.floor((now - next) / 86_400_000);
    return { kind: "overdue", label: days <= 0 ? "Due today" : `Overdue ${days}d` };
  }
  if (!next) {
    if (lead.status === "NEW") {
      const age = Math.floor((now - new Date(lead.createdAt).getTime()) / 86_400_000);
      if (age >= 2) return { kind: "stale-new", label: `Un-actioned ${age}d` };
    }
    return { kind: "no-date", label: "No next-date" };
  }
  return null;
}

/** id → display name for this company's users (owner-name resolution). */
async function userNameMap(companyId: string): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Active members of the company — for the assign dropdown + filters. */
export async function listCompanyUsers(ctx: Ctx) {
  return prisma.user.findMany({
    where: { companyId: ctx.companyId, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Forward-only lead status progression driven by a follow-up. A customer asking
 * about price (PRICE_DISCUSSION) is asking for a quote → QUOTE_REQUESTED. Never
 * regresses: a later routine follow-up won't push QUOTE_REQUESTED back to
 * IN_FOLLOWUP. (Before this, QUOTE_REQUESTED was unreachable — a dead status.)
 */
function advanceLeadStatus(
  current: LeadStatus,
  closeStatus: "LOST" | "ON_HOLD" | undefined,
  outcome: FollowUpOutcome | undefined,
): LeadStatus {
  if (closeStatus) return closeStatus;
  if (outcome === "PRICE_DISCUSSION" && (current === "NEW" || current === "IN_FOLLOWUP")) {
    return "QUOTE_REQUESTED";
  }
  if (current === "NEW") return "IN_FOLLOWUP";
  return current;
}

export interface LeadFilters {
  status?: string;
  source?: string;
  assignedToId?: string;
  cold?: boolean; // going cold: no future follow-up + stale > 3 days
  search?: string;
  cursor?: string;
  take?: number;
}

const leadInclude = {
  contacts: true,
  reference: true,
  proposal: { select: { id: true, number: true, status: true } },
  followUps: { orderBy: { datetime: "desc" } as const, take: 1 },
  _count: { select: { followUps: true } },
} satisfies Prisma.LeadInclude;

export async function listLeads(ctx: Ctx, filters: LeadFilters = {}) {
  const take = Math.min(filters.take ?? 25, 100);
  const where: Prisma.LeadWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status as Prisma.EnumLeadStatusFilter["equals"] } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.search
      ? {
          OR: [
            { customerName: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search } },
            { address: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  if (filters.cold) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    where.status = { in: ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED"] };
    where.updatedAt = { lt: cutoff };
  }

  // EMPLOYEE sees only leads assigned to them or created by them (spec RBAC intent).
  if (ctx.role !== "ADMIN") {
    where.OR = [{ assignedToId: ctx.userId }, { createdById: ctx.userId }];
  }

  const rows = await prisma.lead.findMany({
    where,
    include: leadInclude,
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const names = await userNameMap(ctx.companyId);
  const enriched = stripPricing(items, ctx.role).map((l) => ({
    ...l,
    assignedToName: names.get(l.assignedToId) ?? "Unassigned",
    urgency: leadUrgency(l),
    score: leadScore({
      capacityKLD: l.capacityKLD,
      budgetBand: l.budgetBand,
      decisionTimeline: l.decisionTimeline,
      source: l.source,
      latestOutcome: l.followUps[0]?.outcome ?? null,
    }),
  }));
  return {
    items: enriched,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

export async function getLead(ctx: Ctx, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId: ctx.companyId, deletedAt: null },
    include: {
      contacts: true,
      reference: true,
      proposal: { select: { id: true, number: true, status: true } },
      followUps: { orderBy: { datetime: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) return null;
  if (ctx.role !== "ADMIN" && lead.assignedToId !== ctx.userId && lead.createdById !== ctx.userId) {
    return null;
  }
  const names = await userNameMap(ctx.companyId);
  return {
    ...stripPricing(lead, ctx.role),
    assignedToName: names.get(lead.assignedToId) ?? "Unassigned",
    urgency: leadUrgency(lead),
    score: leadScore({
      capacityKLD: lead.capacityKLD,
      budgetBand: lead.budgetBand,
      decisionTimeline: lead.decisionTimeline,
      source: lead.source,
      latestOutcome: lead.followUps[0]?.outcome ?? null,
    }),
    // Indicative pre-quote value (sell-side band from the KLD template; not cost).
    boqPreview: lead.capacityKLD ? boqPreview(lead.capacityKLD) : null,
  };
}

/** Duplicate-check key is phone (spec §7.1). */
export async function findDuplicateByPhone(ctx: Ctx, phone: string) {
  return prisma.lead.findFirst({
    where: { companyId: ctx.companyId, phone, deletedAt: null },
    select: { id: true, customerName: true, status: true },
  });
}

export async function createLead(ctx: Ctx, input: CreateLeadInput) {
  if (!input.overrideDuplicate) {
    const dup = await findDuplicateByPhone(ctx, input.phone);
    if (dup) {
      return { duplicate: dup as { id: string; customerName: string; status: string } };
    }
  }

  const lead = await prisma.$transaction(async (tx) => {
    let referenceId = input.referenceId;
    if (!referenceId && input.reference?.name) {
      const ref = await tx.reference.create({
        data: {
          companyId: ctx.companyId,
          name: input.reference.name,
          address: input.reference.address,
          phone: input.reference.phone,
          email: input.reference.email || null,
        },
      });
      referenceId = ref.id;
    }

    const created = await tx.lead.create({
      data: {
        companyId: ctx.companyId,
        customerName: input.customerName,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        phone: input.phone,
        email: input.email || null,
        source: input.source,
        requirement: input.requirement,
        plantType: input.plantType,
        technology: input.technology,
        capacityKLD: input.capacityKLD,
        segment: input.segment,
        budgetBand: input.budgetBand,
        decisionTimeline: input.decisionTimeline,
        inletBOD: input.inletBOD,
        inletCOD: input.inletCOD,
        inletTSS: input.inletTSS,
        inletTDS: input.inletTDS,
        status: "NEW",
        assignedToId: input.assignedToId || ctx.userId,
        referenceId,
        createdById: ctx.userId,
        contacts: input.contacts?.length
          ? {
              create: input.contacts.map((c) => ({
                name: c.name,
                designation: c.designation,
                mobile: c.mobile,
              })),
            }
          : undefined,
      },
    });

    await logAudit(
      ctx,
      { action: "CREATE", entity: "Lead", entityId: created.id, after: { phone: created.phone } },
      tx,
    );
    return created;
  });

  return { lead: stripPricing(lead, ctx.role) };
}

/**
 * Edit a lead's core fields (spec §7.1 — leads must be correctable; a wrong
 * phone/name was previously permanent). RBAC-scoped like getLead. If the phone
 * changes to one already used by *another* lead, returns { duplicate } unless
 * overridden — same guard as create, excluding self. Status/contacts/reference
 * are managed on their own paths, not here.
 */
export async function updateLead(ctx: Ctx, id: string, input: UpdateLeadInput) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId: ctx.companyId, deletedAt: null },
  });
  // Collapse missing + no-access into one message (like getLead) so we don't
  // leak that a lead exists to someone who can't see it.
  const noAccess =
    lead && ctx.role !== "ADMIN" && lead.assignedToId !== ctx.userId && lead.createdById !== ctx.userId;
  if (!lead || noAccess) throw new Error("Lead not found");

  if (input.phone !== lead.phone && !input.overrideDuplicate) {
    const dup = await prisma.lead.findFirst({
      where: { companyId: ctx.companyId, phone: input.phone, deletedAt: null, NOT: { id } },
      select: { id: true, customerName: true, status: true },
    });
    if (dup) return { duplicate: dup as { id: string; customerName: string; status: string } };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.lead.update({
      where: { id },
      data: {
        customerName: input.customerName,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        phone: input.phone,
        email: input.email || null,
        source: input.source,
        requirement: input.requirement,
        plantType: input.plantType,
        technology: input.technology,
        capacityKLD: input.capacityKLD,
        segment: input.segment,
        budgetBand: input.budgetBand,
        decisionTimeline: input.decisionTimeline,
        inletBOD: input.inletBOD,
        inletCOD: input.inletCOD,
        inletTSS: input.inletTSS,
        inletTDS: input.inletTDS,
      },
    });
    await logAudit(
      ctx,
      {
        action: "UPDATE",
        entity: "Lead",
        entityId: id,
        before: { customerName: lead.customerName, phone: lead.phone, source: lead.source },
        after: { customerName: next.customerName, phone: next.phone, source: next.source },
      },
      tx,
    );
    return next;
  });

  return { lead: stripPricing(updated, ctx.role) };
}

/**
 * Reassign a lead's owner (admin-only). Validates the target is an active member
 * of the same company — reassigning to an EMPLOYEE moves the lead into their
 * scope and out of the previous owner's (listLeads/getLead enforce it). Audited.
 */
export async function assignLead(ctx: Ctx, leadId: string, userId: string) {
  requireAdmin(ctx);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!lead) throw new Error("Lead not found");
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: ctx.companyId, active: true },
    select: { id: true, name: true },
  });
  if (!target) throw new Error("Assignee must be an active member of this company");

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.lead.update({ where: { id: leadId }, data: { assignedToId: userId } });
    await logAudit(
      ctx,
      {
        action: "UPDATE",
        entity: "Lead",
        entityId: leadId,
        before: { assignedToId: lead.assignedToId },
        after: { assignedToId: userId },
      },
      tx,
    );
    return next;
  });
  return { lead: stripPricing(updated, ctx.role), assignedToName: target.name };
}

/**
 * Bulk reassign leads to one owner (admin only). Applies per-lead through
 * assignLead so the same validation + audit + access rules hold; returns how
 * many succeeded. Ignores ids the caller can't touch rather than failing the batch.
 */
export async function bulkAssign(ctx: Ctx, leadIds: string[], userId: string) {
  requireAdmin(ctx);
  let updated = 0;
  for (const id of leadIds.slice(0, 500)) {
    try {
      await assignLead(ctx, id, userId);
      updated += 1;
    } catch {
      /* skip leads that vanished / aren't in scope */
    }
  }
  return { updated };
}

/** Bulk status change (admin + owner per lead, via setLeadStatus). */
export async function bulkSetStatus(ctx: Ctx, leadIds: string[], status: ManualStatus, lostReason?: string) {
  let updated = 0;
  for (const id of leadIds.slice(0, 500)) {
    try {
      await setLeadStatus(ctx, id, status, lostReason);
      updated += 1;
    } catch {
      /* skip */
    }
  }
  return { updated };
}

/** Pipeline KPIs for the leads header — RBAC-scoped like listLeads. */
export async function leadStats(ctx: Ctx) {
  const scope: Prisma.LeadWhereInput =
    ctx.role !== "ADMIN"
      ? { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] }
      : {};
  const base: Prisma.LeadWhereInput = { companyId: ctx.companyId, deletedAt: null, ...scope };

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const coldCutoff = new Date();
  coldCutoff.setDate(coldCutoff.getDate() - 3);

  const [newCount, dueToday, cold, convertedThisMonth] = await Promise.all([
    prisma.lead.count({ where: { ...base, status: "NEW" } }),
    prisma.followUp.count({
      where: { nextDate: { gte: dayStart, lte: dayEnd }, lead: { is: base } },
    }),
    prisma.lead.count({
      where: { ...base, status: { in: OPEN_STATUSES }, updatedAt: { lt: coldCutoff } },
    }),
    prisma.lead.count({ where: { ...base, status: "CONVERTED", updatedAt: { gte: monthStart } } }),
  ]);
  return { newCount, dueToday, cold, convertedThisMonth };
}

/** Statuses a user can set by hand (CONVERTED is reached only via convertToProposal). */
export type ManualStatus = "NEW" | "IN_FOLLOWUP" | "QUOTE_REQUESTED" | "ON_HOLD" | "LOST";

/**
 * Manually set a lead's status — the reopen path (LOST/ON_HOLD → NEW/IN_FOLLOWUP)
 * that follow-ups can't express, plus explicit put-on-hold / mark-lost. Access:
 * admin or the lead's owner/creator. CONVERTED is terminal (use the proposal).
 * Marking LOST requires a reason; reopening clears the old lost reason. Audited.
 */
export async function setLeadStatus(
  ctx: Ctx,
  leadId: string,
  status: ManualStatus,
  lostReason?: string,
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
  });
  const noAccess =
    lead && ctx.role !== "ADMIN" && lead.assignedToId !== ctx.userId && lead.createdById !== ctx.userId;
  if (!lead || noAccess) throw new Error("Lead not found");
  if (lead.status === "CONVERTED") throw new Error("A converted lead's status is locked");
  if (status === "LOST" && !lostReason?.trim()) throw new Error("A reason is required to mark a lead LOST");

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.lead.update({
      where: { id: leadId },
      data: { status, lostReason: status === "LOST" ? lostReason : null },
    });
    await logAudit(
      ctx,
      {
        action: "UPDATE",
        entity: "Lead",
        entityId: leadId,
        before: { status: lead.status },
        after: { status },
      },
      tx,
    );
    return next;
  });
  return { lead: stripPricing(updated, ctx.role) };
}

/** Soft-delete (archive) a lead — admin only. Every query already filters deletedAt. */
export async function archiveLead(ctx: Ctx, leadId: string) {
  requireAdmin(ctx);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!lead) throw new Error("Lead not found");
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
    await logAudit(ctx, { action: "DELETE", entity: "Lead", entityId: leadId, before: { status: lead.status } }, tx);
  });
  return { ok: true };
}

export interface LeadEvent {
  at: Date;
  kind: "created" | "followup" | "edited" | "reassigned" | "status" | "converted" | "comm";
  title: string;
  detail?: string;
  followUp?: {
    id: string;
    type: string;
    outcome: string | null;
    notes: string;
    nextDate: Date | null;
    geoAddress: string | null;
    audioUrl: string | null;
  };
  comm?: {
    channel: string;
    direction: string;
    body: string;
    sentStatus: string | null;
  };
}

/**
 * Unified activity timeline (spec §7.1 richer than follow-ups-only). Merges the
 * lead's follow-ups with its audit trail (create / edit / reassign / status) and
 * the conversion event, newest first. Access mirrors getLead.
 */
export async function leadActivity(ctx: Ctx, leadId: string): Promise<LeadEvent[] | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
    include: {
      followUps: { orderBy: { datetime: "desc" } },
      communications: { orderBy: { createdAt: "desc" } },
      proposal: { select: { id: true, number: true, createdAt: true } },
    },
  });
  if (!lead) return null;
  if (ctx.role !== "ADMIN" && lead.assignedToId !== ctx.userId && lead.createdById !== ctx.userId) {
    return null;
  }

  const names = await userNameMap(ctx.companyId);
  const events: LeadEvent[] = [];

  events.push({ at: lead.createdAt, kind: "created", title: "Lead created", detail: `via ${lead.source}` });

  for (const c of lead.communications) {
    const arrow = c.direction === "IN" ? "←" : "→";
    events.push({
      at: c.createdAt,
      kind: "comm",
      title: `${c.channel} ${arrow}`,
      comm: { channel: c.channel, direction: c.direction, body: c.body, sentStatus: c.sentStatus },
    });
  }

  for (const fu of lead.followUps) {
    events.push({
      at: fu.datetime,
      kind: "followup",
      title: fu.type.replace(/_/g, " "),
      followUp: {
        id: fu.id,
        type: fu.type,
        outcome: fu.outcome,
        notes: fu.notes,
        nextDate: fu.nextDate,
        geoAddress: fu.geoAddress,
        audioUrl: fu.audioUrl,
      },
    });
  }

  // Interpret the lead's own audit rows into human events.
  const audits = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, entity: "Lead", entityId: leadId, action: "UPDATE" },
    orderBy: { createdAt: "desc" },
  });
  for (const a of audits) {
    const after = (a.after ?? {}) as Record<string, unknown>;
    if ("assignedToId" in after) {
      events.push({
        at: a.createdAt,
        kind: "reassigned",
        title: "Reassigned",
        detail: `to ${names.get(String(after.assignedToId)) ?? "another owner"}`,
      });
    } else if ("status" in after) {
      events.push({ at: a.createdAt, kind: "status", title: `Status → ${String(after.status).replace(/_/g, " ")}` });
    } else {
      events.push({ at: a.createdAt, kind: "edited", title: "Details edited" });
    }
  }

  if (lead.proposal) {
    events.push({
      at: lead.proposal.createdAt,
      kind: "converted",
      title: "Converted to proposal",
      detail: lead.proposal.number,
    });
  }

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return events;
}

/**
 * All matching leads for Excel export (no pagination cap) — the on-screen export
 * only dumped the visible page. Bounded to 5000 to stay a single response. Same
 * filters + RBAC as listLeads.
 */
export async function allLeadsForExport(ctx: Ctx, filters: LeadFilters = {}) {
  const where: Prisma.LeadWhereInput = {
    companyId: ctx.companyId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status as Prisma.EnumLeadStatusFilter["equals"] } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.search
      ? {
          OR: [
            { customerName: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search } },
            { address: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (filters.cold) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    where.status = { in: OPEN_STATUSES };
    where.updatedAt = { lt: cutoff };
  }
  if (ctx.role !== "ADMIN") {
    where.OR = [{ assignedToId: ctx.userId }, { createdById: ctx.userId }];
  }
  const rows = await prisma.lead.findMany({ where, orderBy: { updatedAt: "desc" }, take: 5000 });
  const names = await userNameMap(ctx.companyId);
  return stripPricing(rows, ctx.role).map((l) => ({
    customerName: l.customerName,
    address: l.address,
    phone: l.phone,
    email: l.email ?? "",
    source: l.source,
    status: l.status,
    requirement: l.requirement ?? "",
    owner: names.get(l.assignedToId) ?? "",
  }));
}

export interface LeadAnalytics {
  total: number;
  funnel: { status: string; count: number }[];
  won: number;
  lost: number;
  open: number;
  winRatePct: number | null; // won / (won + lost)
  lostByReason: { reason: string; count: number }[];
  bySegment: { segment: string; count: number; won: number }[];
  bySource: { source: string; count: number; won: number }[];
  temperature: { HOT: number; WARM: number; COLD: number };
  openPipelineValue: number; // Σ indicative mid for open leads with a KLD
}

const FUNNEL_ORDER: LeadStatus[] = [
  "NEW",
  "IN_FOLLOWUP",
  "QUOTE_REQUESTED",
  "CONVERTED",
  "ON_HOLD",
  "LOST",
];

/**
 * Pipeline analytics for the leads module (spec §7.1 — win/loss + segment/source
 * insight the structured P2 fields unlock). RBAC-scoped like listLeads; the
 * pipeline value uses the same sell-side indicative estimate as the detail preview.
 */
export async function leadAnalytics(ctx: Ctx): Promise<LeadAnalytics> {
  const scope: Prisma.LeadWhereInput =
    ctx.role !== "ADMIN" ? { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] } : {};
  const leads = await prisma.lead.findMany({
    where: { companyId: ctx.companyId, deletedAt: null, ...scope },
    select: {
      status: true,
      lostReason: true,
      segment: true,
      source: true,
      capacityKLD: true,
      budgetBand: true,
      decisionTimeline: true,
      followUps: { take: 1, orderBy: { datetime: "desc" }, select: { outcome: true } },
    },
    take: 5000,
  });

  const statusCount = new Map<string, number>();
  const reason = new Map<string, number>();
  const segment = new Map<string, { count: number; won: number }>();
  const source = new Map<string, { count: number; won: number }>();
  const temperature = { HOT: 0, WARM: 0, COLD: 0 };
  let won = 0;
  let lost = 0;
  let open = 0;
  let openPipelineValue = 0;

  const bump = (m: Map<string, { count: number; won: number }>, key: string, isWon: boolean) => {
    const e = m.get(key) ?? { count: 0, won: 0 };
    e.count += 1;
    if (isWon) e.won += 1;
    m.set(key, e);
  };

  for (const l of leads) {
    statusCount.set(l.status, (statusCount.get(l.status) ?? 0) + 1);
    const isWon = l.status === "CONVERTED";
    if (isWon) won += 1;
    if (l.status === "LOST") {
      lost += 1;
      // Group by the base reason (strip the "— free note" suffix).
      const base = (l.lostReason ?? "Unspecified").split(" — ")[0].trim() || "Unspecified";
      reason.set(base, (reason.get(base) ?? 0) + 1);
    }
    bump(segment, l.segment || "Unspecified", isWon);
    bump(source, l.source, isWon);

    if (OPEN_STATUSES.includes(l.status)) {
      open += 1;
      const t = leadScore({
        capacityKLD: l.capacityKLD,
        budgetBand: l.budgetBand,
        decisionTimeline: l.decisionTimeline,
        source: l.source,
        latestOutcome: l.followUps[0]?.outcome ?? null,
      }).temperature;
      temperature[t] += 1;
      if (l.capacityKLD) {
        const p = boqPreview(l.capacityKLD);
        if (p) openPipelineValue += p.mid;
      }
    }
  }

  const closed = won + lost;
  return {
    total: leads.length,
    funnel: FUNNEL_ORDER.filter((s) => statusCount.has(s)).map((s) => ({ status: s, count: statusCount.get(s)! })),
    won,
    lost,
    open,
    winRatePct: closed > 0 ? Math.round((won / closed) * 100) : null,
    lostByReason: [...reason.entries()].map(([r, count]) => ({ reason: r, count })).sort((a, b) => b.count - a.count),
    bySegment: [...segment.entries()].map(([s, v]) => ({ segment: s, ...v })).sort((a, b) => b.count - a.count),
    bySource: [...source.entries()].map(([s, v]) => ({ source: s, ...v })).sort((a, b) => b.count - a.count),
    temperature,
    openPipelineValue: Math.round(openPipelineValue),
  };
}

/** Fetch a lead the caller may act on, or throw (collapses missing + no-access). */
async function accessibleLead(ctx: Ctx, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
  });
  const noAccess =
    lead && ctx.role !== "ADMIN" && lead.assignedToId !== ctx.userId && lead.createdById !== ctx.userId;
  if (!lead || noAccess) throw new Error("Lead not found");
  return lead;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface LogCommunicationInput {
  leadId: string;
  channel: "CALL" | "WHATSAPP" | "EMAIL";
  direction?: "OUT" | "IN";
  body: string;
  toAddress?: string;
  subject?: string;
  sentStatus?: string;
}

/** Record a communication (a touch) against a lead — the log path (no send). */
export async function logCommunication(ctx: Ctx, input: LogCommunicationInput) {
  const lead = await accessibleLead(ctx, input.leadId);
  const comm = await prisma.communication.create({
    data: {
      companyId: ctx.companyId,
      leadId: lead.id,
      channel: input.channel,
      direction: input.direction ?? "OUT",
      body: input.body,
      toAddress: input.toAddress,
      subject: input.subject,
      sentStatus: input.sentStatus ?? "LOGGED",
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Communication", entityId: comm.id, after: { leadId: lead.id, channel: input.channel } });
  return comm;
}

/**
 * Send a WhatsApp to the lead's number via the wired transport, and log it. The
 * SEND is gated (no-op → sentStatus LOGGED when no transport configured); the LOG
 * always records the touch. ⚠️ Live delivery needs a WhatsApp token (untested here).
 */
export async function sendLeadWhatsApp(ctx: Ctx, leadId: string, body: string) {
  const lead = await accessibleLead(ctx, leadId);
  if (!body.trim()) throw new Error("Message cannot be empty");
  const res = await sendWhatsAppText(lead.phone, body);
  const sentStatus = res.sent ? "SENT" : res.transport === "none" ? "LOGGED" : "FAILED";
  const comm = await logCommunication(ctx, {
    leadId, channel: "WHATSAPP", direction: "OUT", body, toAddress: lead.phone, sentStatus,
  });
  return { comm, delivery: res };
}

/** Send an email to the lead and log it. Send gated (Resend); log always records. */
export async function sendLeadEmail(ctx: Ctx, leadId: string, subject: string, body: string) {
  const lead = await accessibleLead(ctx, leadId);
  if (!lead.email) throw new Error("This lead has no email address");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and message are required");
  const res = await sendEmail({ to: lead.email, subject, html: `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>` });
  const sentStatus = res.sent ? "SENT" : "LOGGED";
  const comm = await logCommunication(ctx, {
    leadId, channel: "EMAIL", direction: "OUT", body, subject, toAddress: lead.email, sentStatus,
  });
  return { comm, delivery: res };
}

/**
 * Record an inbound WhatsApp against the matching lead (system path — no user
 * ctx; called by the webhook). Matches on the last 10 phone digits; attributes
 * to the lead's owner. Returns the created comm id or null if no lead matches.
 */
export async function recordInboundWhatsApp(fromPhone: string, text: string): Promise<string | null> {
  const last10 = fromPhone.replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return null;
  const lead = await prisma.lead.findFirst({
    where: { phone: { endsWith: last10 }, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (!lead) return null;
  const comm = await prisma.communication.create({
    data: {
      companyId: lead.companyId,
      leadId: lead.id,
      channel: "WHATSAPP",
      direction: "IN",
      body: text,
      toAddress: lead.phone,
      sentStatus: "RECEIVED",
      createdById: lead.assignedToId,
    },
  });
  return comm.id;
}

/** Attach an already-uploaded document (url/name from /api/uploads) to a lead. */
export async function addLeadDocument(ctx: Ctx, leadId: string, doc: { url: string; name: string }) {
  const lead = await accessibleLead(ctx, leadId);
  const created = await prisma.leadDocument.create({
    data: { companyId: ctx.companyId, leadId: lead.id, url: doc.url, name: doc.name, createdById: ctx.userId },
  });
  await logAudit(ctx, { action: "CREATE", entity: "LeadDocument", entityId: created.id, after: { leadId: lead.id, name: doc.name } });
  return created;
}

export async function deleteLeadDocument(ctx: Ctx, docId: string) {
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, companyId: ctx.companyId } });
  if (!doc) throw new Error("Document not found");
  await accessibleLead(ctx, doc.leadId); // access gate (throws if not permitted)
  await prisma.leadDocument.delete({ where: { id: docId } });
  await logAudit(ctx, { action: "DELETE", entity: "LeadDocument", entityId: docId, before: { name: doc.name } });
  return { ok: true };
}

export async function addFollowUp(ctx: Ctx, input: CreateFollowUpInput) {
  if (!input.leadId) throw new Error("leadId required for a lead follow-up");
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, companyId: ctx.companyId, deletedAt: null },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status === "CONVERTED") throw new Error("Converted leads are read-only");

  return prisma.$transaction(async (tx) => {
    const fu = await tx.followUp.create({
      data: {
        leadId: input.leadId,
        type: input.type,
        notes: input.notes,
        rawTranscript: input.rawTranscript,
        audioUrl: input.audioUrl,
        outcome: input.outcome,
        nextDate: input.nextDate,
        lat: input.lat,
        lng: input.lng,
        geoAddress: input.geoAddress,
        attachments: input.attachments as Prisma.InputJsonValue,
        createdById: ctx.userId,
      },
    });

    const nextStatus = advanceLeadStatus(lead.status, input.closeStatus, input.outcome);
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: nextStatus,
        lostReason: input.closeStatus === "LOST" ? input.lostReason : lead.lostReason,
      },
    });

    await logAudit(
      ctx,
      { action: "CREATE", entity: "FollowUp", entityId: fu.id, after: { leadId: lead.id } },
      tx,
    );
    return fu;
  });
}

/**
 * Convert a lead into a DRAFT proposal (spec §7.1). Single transaction:
 * create Proposal (+ empty v1) with a sequential number, mark lead CONVERTED
 * (read-only). One conversion per lead — guarded by the unique leadId on Proposal.
 */
/**
 * Correct a follow-up's notes / next-date / outcome (append-only was too strict;
 * a mistyped note should be fixable). Does NOT retroactively re-run lead-status
 * progression — editing a historical record shouldn't rewrite the lead's current
 * status. RBAC via the follow-up's lead; audited.
 */
export async function updateFollowUp(
  ctx: Ctx,
  id: string,
  input: { notes: string; nextDate?: Date; outcome?: FollowUpOutcome },
) {
  const fu = await prisma.followUp.findFirst({ where: { id } });
  if (!fu || !fu.leadId) throw new Error("Follow-up not found");
  await accessibleLead(ctx, fu.leadId);
  const updated = await prisma.followUp.update({
    where: { id },
    data: { notes: input.notes, nextDate: input.nextDate ?? null, outcome: input.outcome ?? null },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "FollowUp", entityId: id, after: { leadId: fu.leadId } });
  return updated;
}

export async function deleteFollowUp(ctx: Ctx, id: string) {
  const fu = await prisma.followUp.findFirst({ where: { id } });
  if (!fu || !fu.leadId) throw new Error("Follow-up not found");
  await accessibleLead(ctx, fu.leadId);
  await prisma.followUp.delete({ where: { id } });
  await logAudit(ctx, { action: "DELETE", entity: "FollowUp", entityId: id, before: { leadId: fu.leadId } });
  return { ok: true };
}

export async function convertToProposal(ctx: Ctx, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId, deletedAt: null },
    include: { proposal: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.proposal) return { proposalId: lead.proposal.id, already: true };
  if (lead.status === "CONVERTED") throw new Error("Lead already converted");

  const year = new Date().getFullYear();
  return prisma.$transaction(async (tx) => {
    const number = await allocateNumber(tx, ctx.companyId, "PROPOSAL", year);
    const proposal = await tx.proposal.create({
      data: {
        companyId: ctx.companyId,
        number,
        leadId: lead.id,
        projectName: lead.customerName,
        siteAddress: lead.address,
        // Carry the lead's structured sizing into the proposal; coalesce for
        // pre-P2 leads (Proposal.plantType/technology/capacityKLD are NOT nullable).
        plantType: lead.plantType ?? "STP",
        technology: lead.technology ?? "MBBR",
        capacityKLD: lead.capacityKLD ?? 0,
        status: "DRAFT",
        createdById: ctx.userId,
        versions: {
          create: {
            versionNo: 1,
            scopeOfWork: {},
            technicalText: "",
            subtotal: 0,
            gstAmount: 0,
            grandTotal: 0,
            paymentTerms: [],
            terms: [],
          },
        },
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED" } });
    await logAudit(
      ctx,
      { action: "CREATE", entity: "Proposal", entityId: proposal.id, after: { number } },
      tx,
    );
    return { proposalId: proposal.id, number, already: false };
  });
}
