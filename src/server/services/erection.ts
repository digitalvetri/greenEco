import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin, requireProjectAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

/**
 * Create an erection entry (spec §7.5). SITE_PURCHASE requires ≥1 bill image.
 * Optional auto-approve when amount ≤ AUTO_APPROVE_LIMIT and a bill is attached.
 */
export async function createErectionEntry(
  ctx: Ctx,
  data: {
    orderId: string;
    type: "LABOUR" | "SITE_PURCHASE" | "OTHER";
    date: Date;
    description: string;
    gangOrShop?: string;
    amount: number;
    paymentMode?: string;
    billImages: { url: string }[];
  },
) {
  await requireProjectAccess(ctx, data.orderId);
  if (data.type === "SITE_PURCHASE" && (!data.billImages || data.billImages.length === 0)) {
    throw new Error("Site purchase requires at least one bill image");
  }
  const hasBill = data.billImages && data.billImages.length > 0;
  // A10: when Claude vision is available, defer auto-approval to the vision check
  // (PASS + within limit). Without a key, keep the existing amount-based auto-approve.
  const visionOn = !!env.anthropicApiKey;
  const autoApprove = env.autoApproveLimit > 0 && data.amount <= env.autoApproveLimit && !!hasBill && !visionOn;

  const entry = await prisma.erectionEntry.create({
    data: {
      orderId: data.orderId,
      type: data.type,
      date: data.date,
      description: data.description,
      gangOrShop: data.gangOrShop,
      amount: new Decimal(data.amount).toFixed(2),
      paymentMode: data.paymentMode,
      billImages: data.billImages as Prisma.InputJsonValue,
      status: autoApprove ? "APPROVED" : "PENDING",
      reviewedById: autoApprove ? "auto" : null,
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "ErectionEntry", entityId: entry.id, after: { auto: autoApprove } });

  // A10 — vision bill check (assistive; may auto-approve a PASS within limit). Best-effort.
  if (hasBill && visionOn) {
    try {
      const { assistBillVerification } = await import("@/server/automations/bill-verification-assist");
      await assistBillVerification(ctx, entry.id);
    } catch {
      /* vision is best-effort — never blocks entry creation */
    }
  }
  return entry;
}

export interface EntryFilters {
  orderId?: string;
  pendingOnly?: boolean;
  needsReview?: boolean; // PENDING + QUERIED — the review queue (resolves the QUERIED dead-end)
  type?: string; // LABOUR | SITE_PURCHASE | OTHER
  status?: string; // PENDING | APPROVED | QUERIED | REJECTED
  search?: string;
  cursor?: string;
  take?: number;
}

function statusClause(filters: EntryFilters): Prisma.ErectionEntryWhereInput {
  if (filters.needsReview) return { status: { in: ["PENDING", "QUERIED"] } };
  if (filters.pendingOnly) return { status: "PENDING" };
  if (filters.status) return { status: filters.status as Prisma.EnumEntryStatusFilter["equals"] };
  return {};
}

/**
 * List erection entries with cursor pagination + search + type/status filter.
 * Before this the service was an *unbounded* findMany (bare array) called twice per
 * page. Employees are creator-scoped (see only their own entries); admin sees all.
 * `amount` is the author's own logged spend (creator-scoped) — not a pricing leak.
 */
export async function listEntries(ctx: Ctx, filters: EntryFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const where: Prisma.ErectionEntryWhereInput = {
    order: { companyId: ctx.companyId },
    ...(filters.orderId ? { orderId: filters.orderId } : {}),
    ...statusClause(filters),
    ...(filters.type ? { type: filters.type as Prisma.EnumErectionTypeFilter["equals"] } : {}),
    ...(filters.search
      ? {
          OR: [
            { description: { contains: filters.search, mode: "insensitive" } },
            { gangOrShop: { contains: filters.search, mode: "insensitive" } },
            { order: { is: { orderNo: { contains: filters.search, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(ctx.role !== "ADMIN" ? { createdById: ctx.userId } : {}),
  };
  const rows = await prisma.erectionEntry.findMany({
    where,
    include: { order: { select: { orderNo: true, clientName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export interface ErectionStats {
  pendingReview: number; // company-wide for admin; own PENDING for employee
  queriedRejected: number;
  approvedSpend: number | null; // Σ approved entry amount — admin-only
  overrunProjects: number | null; // active projects ≥100% budget — admin-only
}

/** Header KPIs. `approvedSpend` + `overrunProjects` are admin-only aggregates. */
export async function erectionStats(ctx: Ctx): Promise<ErectionStats> {
  const isAdmin = ctx.role === "ADMIN";
  const scope: Prisma.ErectionEntryWhereInput = {
    order: { companyId: ctx.companyId },
    ...(isAdmin ? {} : { createdById: ctx.userId }),
  };
  const [pendingReview, queriedRejected] = await Promise.all([
    prisma.erectionEntry.count({ where: { ...scope, status: "PENDING" } }),
    prisma.erectionEntry.count({ where: { ...scope, status: { in: ["QUERIED", "REJECTED"] } } }),
  ]);
  if (!isAdmin) return { pendingReview, queriedRejected, approvedSpend: null, overrunProjects: null };

  const approved = await prisma.erectionEntry.findMany({ where: { ...scope, status: "APPROVED" }, select: { amount: true } });
  const approvedSpend = Math.round(approved.reduce<Decimal>((a, e) => a.plus(e.amount), new Decimal(0)).toNumber());

  // Overrun projects — same definition as the budget-vs-actual cards: spent (approved
  // erection + site consumption) + committed (open POs to site) ≥ budget. Computed with
  // a few grouped queries (not a per-order budgetVsActual fan-out).
  const active = await prisma.order.findMany({
    where: { companyId: ctx.companyId, status: "ACTIVE", budget: { isNot: null } },
    select: { id: true, budget: { select: { baseAmount: true } }, siteLocation: { select: { id: true } } },
  });
  const spendByOrder = new Map<string, Decimal>();
  const approvedByOrder = await prisma.erectionEntry.findMany({ where: { order: { companyId: ctx.companyId }, status: "APPROVED" }, select: { orderId: true, amount: true } });
  for (const e of approvedByOrder) spendByOrder.set(e.orderId, (spendByOrder.get(e.orderId) ?? new Decimal(0)).plus(e.amount));

  const siteIds = active.map((o) => o.siteLocation?.id).filter((x): x is string => !!x);
  const consumeByLoc = new Map<string, Decimal>();
  const committedByLoc = new Map<string, Decimal>();
  if (siteIds.length) {
    const [consumes, openPOs] = await Promise.all([
      prisma.stockMovement.findMany({ where: { companyId: ctx.companyId, type: "CONSUME", fromLocationId: { in: siteIds }, valueAtCost: { not: null } }, select: { fromLocationId: true, valueAtCost: true } }),
      prisma.purchaseOrder.findMany({ where: { companyId: ctx.companyId, destinationId: { in: siteIds }, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } }, select: { destinationId: true, totalValue: true } }),
    ]);
    for (const m of consumes) if (m.fromLocationId) consumeByLoc.set(m.fromLocationId, (consumeByLoc.get(m.fromLocationId) ?? new Decimal(0)).plus(m.valueAtCost ?? 0));
    for (const p of openPOs) committedByLoc.set(p.destinationId, (committedByLoc.get(p.destinationId) ?? new Decimal(0)).plus(p.totalValue));
  }

  let overrunProjects = 0;
  for (const o of active) {
    if (!o.budget) continue;
    const sl = o.siteLocation?.id;
    const spent = (spendByOrder.get(o.id) ?? new Decimal(0)).plus(sl ? consumeByLoc.get(sl) ?? 0 : 0);
    const committed = sl ? committedByLoc.get(sl) ?? new Decimal(0) : new Decimal(0);
    if (spent.plus(committed).gte(new Decimal(o.budget.baseAmount))) overrunProjects += 1;
  }
  return { pendingReview, queriedRejected, approvedSpend, overrunProjects };
}

export async function reviewEntry(
  ctx: Ctx,
  entryId: string,
  action: "APPROVE" | "QUERY" | "REJECT",
  note?: string,
) {
  requireAdmin(ctx);
  const existing = await prisma.erectionEntry.findFirst({ where: { id: entryId, order: { companyId: ctx.companyId } } });
  if (!existing) throw new Error("Entry not found");
  // Terminal-state guard: only PENDING/QUERIED are reviewable — an APPROVED or
  // REJECTED entry is final (no silent flip). QUERIED remains reviewable at the
  // service level, but note the UI has no path to reach a QUERIED entry yet — that
  // review surface lands in the P1 tab-split/timeline wave (see report P1-1b).
  if (existing.status === "APPROVED" || existing.status === "REJECTED") {
    throw new Error(`This entry is already ${existing.status.toLowerCase()} — reopen it before re-reviewing`);
  }
  const status = action === "APPROVE" ? "APPROVED" : action === "QUERY" ? "QUERIED" : "REJECTED";
  const entry = await prisma.erectionEntry.update({
    where: { id: entryId },
    data: { status, adminNote: note, reviewedById: ctx.userId },
  });
  await logAudit(ctx, { action: "APPROVE", entity: "ErectionEntry", entityId: entryId, before: { status: existing.status }, after: { status } });

  // A8 — an approved cost may cross a budget threshold. Best-effort, non-blocking.
  if (status === "APPROVED") {
    try {
      const { checkBudgetThreshold } = await import("@/server/automations/budget-alerts");
      await checkBudgetThreshold(ctx, entry.orderId);
    } catch {
      /* automation is best-effort */
    }
  }
  return entry;
}

export interface ErectionEvent {
  at: Date;
  kind: "created" | "review" | "overrun";
  title: string;
  detail?: string;
  amount?: string; // sell-side / self-authored entry amount (visible to project members)
}

/**
 * Per-project approval-activity timeline — the review history that was audited but
 * never surfaced. Merges: entry logged (type + ₹) → reviewed (approved/queried/
 * rejected) → overrun acknowledgements. Newest-first. ADMIN ONLY — this is a
 * cross-author cost view (it surfaces EVERY team member's entry amounts + review
 * decisions), so it is not creator-scoped and must not be shown to a field employee
 * (who only ever sees their own amounts elsewhere). Pairs with the admin-only detail page.
 */
export async function erectionActivity(ctx: Ctx, orderId: string): Promise<ErectionEvent[] | null> {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId: ctx.companyId }, select: { id: true, budget: { select: { id: true } } } });
  if (!order) return null;

  const entries = await prisma.erectionEntry.findMany({
    where: { orderId },
    select: { id: true, type: true, description: true, amount: true, createdAt: true },
  });
  const descOf = new Map(entries.map((e) => [e.id, e.description]));

  const events: ErectionEvent[] = entries.map((e) => ({
    at: e.createdAt,
    kind: "created",
    title: `${e.type.replace(/_/g, " ")} logged`,
    detail: e.description,
    amount: e.amount.toString(),
  }));

  const entryIds = entries.map((e) => e.id);
  const orFilters: Prisma.AuditLogWhereInput[] = [];
  if (entryIds.length) orFilters.push({ entity: "ErectionEntry", entityId: { in: entryIds }, action: "APPROVE" });
  if (order.budget) orFilters.push({ entity: "Budget", entityId: order.budget.id, action: "UPDATE" });
  if (orFilters.length) {
    const audits = await prisma.auditLog.findMany({ where: { companyId: ctx.companyId, OR: orFilters }, orderBy: { createdAt: "desc" } });
    for (const a of audits) {
      const after = (a.after ?? {}) as Record<string, unknown>;
      if (a.entity === "ErectionEntry" && "status" in after) {
        events.push({ at: a.createdAt, kind: "review", title: `Reviewed → ${String(after.status)}`, detail: descOf.get(a.entityId) });
      } else if (a.entity === "Budget" && "overrunAck" in after) {
        events.push({ at: a.createdAt, kind: "overrun", title: "Overrun acknowledged", detail: String(after.overrunAck) });
      }
    }
  }

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return events;
}

/**
 * Budget vs Actual (spec §7.5) — ADMIN ONLY (never call for EMPLOYEE).
 * Spent = approved LABOUR + approved SITE_PURCHASE + approved OTHER + stock
 * consumption (valueAtCost from the site location). Committed = open POs to site.
 */
export async function budgetVsActual(ctx: Ctx, orderId: string) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: ctx.companyId },
    include: { budget: true, siteLocation: true },
  });
  if (!order) throw new Error("Order not found");

  const entries = await prisma.erectionEntry.findMany({ where: { orderId, status: "APPROVED" } });
  const sumByType = (t: string) =>
    entries.filter((e) => e.type === t).reduce<Decimal>((a, e) => a.plus(e.amount), new Decimal(0));
  const labour = sumByType("LABOUR");
  const sitePurchase = sumByType("SITE_PURCHASE");
  const other = sumByType("OTHER");

  // Consumption valued at cost from the site location.
  let consumption = new Decimal(0);
  if (order.siteLocation) {
    const consumes = await prisma.stockMovement.findMany({
      where: { companyId: ctx.companyId, type: "CONSUME", fromLocationId: order.siteLocation.id, valueAtCost: { not: null } },
      select: { valueAtCost: true },
    });
    consumption = consumes.reduce<Decimal>((a, m) => a.plus(m.valueAtCost ?? 0), new Decimal(0));
  }

  // Committed = open POs delivered to the site.
  let committed = new Decimal(0);
  if (order.siteLocation) {
    const openPOs = await prisma.purchaseOrder.findMany({
      where: {
        companyId: ctx.companyId,
        destinationId: order.siteLocation.id,
        status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] },
      },
      select: { totalValue: true },
    });
    committed = openPOs.reduce<Decimal>((a, p) => a.plus(p.totalValue), new Decimal(0));
  }

  const spent = labour.plus(sitePurchase).plus(other).plus(consumption);
  const budget = order.budget ? new Decimal(order.budget.baseAmount) : new Decimal(0);
  const remaining = budget.minus(spent).minus(committed);
  const pctConsumed = budget.gt(0) ? spent.plus(committed).div(budget).times(100).toNumber() : 0;

  let alert: string | null = null;
  if (pctConsumed >= 100) alert = "OVER BUDGET — admin acknowledgement required";
  else if (pctConsumed >= 90) alert = "90% of budget consumed";
  else if (pctConsumed >= 70) alert = "70% of budget consumed";

  // stripPricing is a defense-in-depth net: requireAdmin already gates this, but if a
  // future caller reaches the return path with a non-admin role, the ADMIN_ONLY keys
  // (budget/committed) are dropped rather than leaked. No-op for the admin caller.
  return stripPricing(
    {
      budget: budget.toFixed(2),
      spent: spent.toFixed(2),
      committed: committed.toFixed(2),
      remaining: remaining.toFixed(2),
      pctConsumed: Math.round(pctConsumed),
      alert,
      categories: {
        labour: labour.toFixed(2),
        sitePurchase: sitePurchase.toFixed(2),
        other: other.toFixed(2),
        consumption: consumption.toFixed(2),
      },
    },
    ctx.role,
  );
}

export interface ErectionAnalytics {
  totalEntries: number;
  byStatus: { status: string; count: number }[];
  approvalRatePct: number | null; // approved ÷ (approved + rejected)
  spendByType: { type: string; value: number }[]; // labour / sitePurchase / other / consumption (₹)
  totalSpend: number; // Σ approved erection + consumption
  overrunCount: number;
  budgetBurn: { orderNo: string; clientName: string; spent: number; budget: number; pctConsumed: number; overrun: boolean }[];
}

/**
 * Erection analytics (spec §7.5) — ADMIN ONLY (all cost aggregates). Approval mix,
 * spend by type, and the per-project budget burn — the latter computed **once** with
 * grouped queries (this is where the main page's N-order budgetVsActual fan-out belongs).
 * No stripPricing net here (unlike budgetVsActual/closeoutData): requireAdmin IS the
 * guarantee — these are cross-project cost aggregates no non-admin should reach, so it
 * throws at the door rather than returning a stripped shell. Same rationale for erectionStats.
 */
export async function erectionAnalytics(ctx: Ctx): Promise<ErectionAnalytics> {
  requireAdmin(ctx);
  const scope: Prisma.ErectionEntryWhereInput = { order: { companyId: ctx.companyId } };
  const [entries, active] = await Promise.all([
    prisma.erectionEntry.findMany({ where: scope, select: { orderId: true, type: true, amount: true, status: true } }),
    prisma.order.findMany({
      where: { companyId: ctx.companyId, status: "ACTIVE", budget: { isNot: null } },
      select: { orderNo: true, clientName: true, id: true, budget: { select: { baseAmount: true } }, siteLocation: { select: { id: true } } },
    }),
  ]);

  const statusCount = new Map<string, number>();
  const typeSpend = new Map<string, Decimal>();
  const approvedByOrder = new Map<string, Decimal>();
  for (const e of entries) {
    statusCount.set(e.status, (statusCount.get(e.status) ?? 0) + 1);
    if (e.status === "APPROVED") {
      typeSpend.set(e.type, (typeSpend.get(e.type) ?? new Decimal(0)).plus(e.amount));
      approvedByOrder.set(e.orderId, (approvedByOrder.get(e.orderId) ?? new Decimal(0)).plus(e.amount));
    }
  }

  // Consumption is summed COMPANY-WIDE (all site locations) so the spend total matches
  // the company-wide erection spend above — mixing scopes would make "total spend" a
  // hybrid of no real quantity. Committed is scoped to active sites (budget-burn only).
  const siteIds = active.map((o) => o.siteLocation?.id).filter((x): x is string => !!x);
  const consumeByLoc = new Map<string, Decimal>();
  const committedByLoc = new Map<string, Decimal>();
  const [consumes, openPOs] = await Promise.all([
    prisma.stockMovement.findMany({ where: { companyId: ctx.companyId, type: "CONSUME", valueAtCost: { not: null } }, select: { fromLocationId: true, valueAtCost: true } }),
    siteIds.length
      ? prisma.purchaseOrder.findMany({ where: { companyId: ctx.companyId, destinationId: { in: siteIds }, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } }, select: { destinationId: true, totalValue: true } })
      : Promise.resolve([]),
  ]);
  for (const m of consumes) if (m.fromLocationId) consumeByLoc.set(m.fromLocationId, (consumeByLoc.get(m.fromLocationId) ?? new Decimal(0)).plus(m.valueAtCost ?? 0));
  for (const p of openPOs) committedByLoc.set(p.destinationId, (committedByLoc.get(p.destinationId) ?? new Decimal(0)).plus(p.totalValue));

  const consumptionTotal = [...consumeByLoc.values()].reduce<Decimal>((a, v) => a.plus(v), new Decimal(0));
  const spendByType = [
    { type: "Labour", value: Math.round((typeSpend.get("LABOUR") ?? new Decimal(0)).toNumber()) },
    { type: "Site purchase", value: Math.round((typeSpend.get("SITE_PURCHASE") ?? new Decimal(0)).toNumber()) },
    { type: "Other", value: Math.round((typeSpend.get("OTHER") ?? new Decimal(0)).toNumber()) },
    { type: "Consumption", value: Math.round(consumptionTotal.toNumber()) },
  ];
  const totalSpend = spendByType.reduce((a, t) => a + t.value, 0);

  const approved = statusCount.get("APPROVED") ?? 0;
  const rejected = statusCount.get("REJECTED") ?? 0;
  const reviewed = approved + rejected;

  let overrunCount = 0;
  const budgetBurn = active
    .map((o) => {
      const sl = o.siteLocation?.id;
      const spent = (approvedByOrder.get(o.id) ?? new Decimal(0)).plus(sl ? consumeByLoc.get(sl) ?? 0 : 0);
      const committed = sl ? committedByLoc.get(sl) ?? new Decimal(0) : new Decimal(0);
      const budget = new Decimal(o.budget!.baseAmount);
      const pctConsumed = budget.gt(0) ? spent.plus(committed).div(budget).times(100).toNumber() : 0;
      const overrun = spent.plus(committed).gte(budget) && budget.gt(0);
      if (overrun) overrunCount += 1;
      return { orderNo: o.orderNo, clientName: o.clientName, spent: Math.round(spent.toNumber()), budget: Math.round(budget.toNumber()), pctConsumed: Math.round(pctConsumed), overrun };
    })
    .sort((a, b) => b.pctConsumed - a.pctConsumed);

  return {
    totalEntries: entries.length,
    byStatus: ["PENDING", "APPROVED", "QUERIED", "REJECTED"].filter((s) => statusCount.has(s)).map((s) => ({ status: s, count: statusCount.get(s)! })),
    approvalRatePct: reviewed > 0 ? Math.round((approved / reviewed) * 100) : null,
    spendByType,
    totalSpend,
    overrunCount,
    budgetBurn,
  };
}

/** Close-out report data (spec §7.5) — admin only; drives the PDF at /print/closeout. */
export async function closeoutData(ctx: Ctx, orderId: string) {
  requireAdmin(ctx);
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: ctx.companyId },
    select: { orderNo: true, clientName: true, siteAddress: true, projectValue: true },
  });
  if (!order) throw new Error("Order not found");
  const bva = await budgetVsActual(ctx, orderId);
  const contractValue = new Decimal(order.projectValue);
  const spent = new Decimal(bva.spent);
  const grossMargin = contractValue.minus(spent);
  // Defense-in-depth: strip ADMIN_ONLY keys (budget/committed/margin) if ever reached
  // by a non-admin. No-op for the admin caller (the closeout PDF).
  return stripPricing(
    {
      order,
      ...bva,
      contractValue: contractValue.toFixed(2),
      grossMargin: grossMargin.toFixed(2),
      grossMarginPct: contractValue.gt(0) ? grossMargin.div(contractValue).times(100).toFixed(1) : "0",
    },
    ctx.role,
  );
}

/** Acknowledge an over-budget overrun (stored in Budget.adjustments). Admin, audited. */
export async function acknowledgeOverrun(ctx: Ctx, orderId: string, note: string) {
  requireAdmin(ctx);
  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.findUnique({ where: { orderId } });
    if (!budget) throw new Error("Budget not found");
    const adjustments = ((budget.adjustments as unknown[]) ?? []).concat({
      reason: note,
      byUserId: ctx.userId,
      date: new Date().toISOString(),
    });
    await tx.budget.update({ where: { orderId }, data: { adjustments: adjustments as Prisma.InputJsonValue } });
    await logAudit(ctx, { action: "UPDATE", entity: "Budget", entityId: budget.id, after: { overrunAck: note } }, tx);
    return { ok: true };
  });
}
