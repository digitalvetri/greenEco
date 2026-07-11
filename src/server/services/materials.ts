import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { allocateNumber } from "./numbering";
import { deriveBalances, deriveItemBalances, belowReorder, type MovementLike } from "@/lib/domain/stock";

// ---------- Items ----------

export interface MaterialFilters {
  search?: string;
  category?: string;
  cursor?: string;
  take?: number;
}

/**
 * Item master + derived stock, cursor-paginated + searchable + category filter.
 * Before this the service was an *unbounded* findMany that pulled the ENTIRE
 * StockMovement ledger into memory every request; now it derives balances for
 * only the page's items (movements scoped by itemId). `purchasePrice` is stripped
 * for EMPLOYEE.
 */
export async function listItems(ctx: Ctx, filters: MaterialFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const where: Prisma.ItemWhereInput = {
    companyId: ctx.companyId,
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { category: { contains: filters.search, mode: "insensitive" } },
            { specification: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await prisma.item.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const pageIds = page.map((i) => i.id);

  // Ledger scan scoped to this page's items only (not the whole table).
  const [movements, locations] = await Promise.all([
    pageIds.length
      ? prisma.stockMovement.findMany({
          where: { companyId: ctx.companyId, itemId: { in: pageIds } },
          select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true },
        })
      : Promise.resolve([]),
    prisma.location.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } }),
  ]);
  const balances = deriveBalances(movements as MovementLike[]);
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const enriched = page.map((i) => {
    const b = balances.get(i.id);
    return {
      ...i,
      total: (b?.total ?? new Decimal(0)).toString(),
      byLocation: b
        ? [...b.byLocation.entries()].map(([loc, qty]) => ({ location: locName.get(loc) ?? loc, qty: qty.toString() }))
        : [],
      lowStock: (b?.total ?? new Decimal(0)).lt(new Decimal(i.reorderLevel)),
    };
  });
  return { items: stripPricing(enriched, ctx.role), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export interface LedgerRow {
  id: string;
  at: Date;
  type: string;
  qty: string;
  fromLocation: string | null;
  toLocation: string | null;
  refDocType: string | null;
  valueAtCost?: string | null; // admin-only (stripped for EMPLOYEE)
  note: string | null;
  runningTotal: string; // total on-hand across all locations after this movement
}

/**
 * One item's detail + its full StockMovement ledger — the append-only ledger
 * (spec §7.4) finally surfaced (it was read only to derive balances). Newest-first
 * with a running on-hand total. `purchasePrice`, `valueAtCost`, and `vendorPrices`
 * are all ADMIN_ONLY_KEYS → stripped for EMPLOYEE by stripPricing.
 */
export async function itemLedger(ctx: Ctx, itemId: string) {
  const item = await prisma.item.findFirst({ where: { id: itemId, companyId: ctx.companyId } });
  if (!item) return null;

  const [movements, locations, vendors] = await Promise.all([
    // id tiebreak makes the running balance deterministic: a transfer's paired
    // OUT+IN rows share one transaction createdAt, and the OUT is created first so
    // its cuid sorts earlier → OUT-before-IN (no phantom intermediate balance).
    prisma.stockMovement.findMany({ where: { companyId: ctx.companyId, itemId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.location.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } }),
  ]);
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  // Running total across all locations (a movement credits toLocation, debits fromLocation).
  let running = new Decimal(0);
  const asc: LedgerRow[] = movements.map((m) => {
    const qty = new Decimal(m.qty);
    if (m.toLocationId) running = running.plus(qty);
    if (m.fromLocationId) running = running.minus(qty);
    return {
      id: m.id,
      at: m.createdAt,
      type: m.type,
      qty: qty.toString(),
      fromLocation: m.fromLocationId ? locName.get(m.fromLocationId) ?? m.fromLocationId : null,
      toLocation: m.toLocationId ? locName.get(m.toLocationId) ?? m.toLocationId : null,
      refDocType: m.refDocType,
      valueAtCost: m.valueAtCost ? m.valueAtCost.toString() : null,
      note: m.note,
      runningTotal: running.toString(),
    };
  });
  const ledger = asc.reverse(); // newest-first

  const bal = deriveItemBalances(movements as MovementLike[]);
  const byLocation = [...bal.byLocation.entries()].map(([loc, q]) => ({ location: locName.get(loc) ?? loc, qty: q.toString() }));

  const vendorPrices = (
    await prisma.vendorPrice.findMany({ where: { itemId }, orderBy: { date: "desc" }, take: 12 })
  ).map((vp) => ({ vendor: vendorName.get(vp.vendorId) ?? vp.vendorId, rate: vp.rate.toString(), date: vp.date }));

  const view = {
    item: {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      specification: item.specification,
      reorderLevel: item.reorderLevel.toString(),
      purchasePrice: item.purchasePrice ? item.purchasePrice.toString() : null,
    },
    total: bal.total.toString(),
    lowStock: bal.total.lt(new Decimal(item.reorderLevel)),
    byLocation,
    ledger,
    vendorPrices, // ADMIN_ONLY key → dropped for EMPLOYEE
  };
  return stripPricing(view, ctx.role);
}

/** All items as lightweight options (id/name/unit) for dropdowns — no ledger scan. */
export async function itemOptions(ctx: Ctx) {
  return prisma.item.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });
}

/** Distinct item categories for the list filter tabs. */
export async function materialCategories(ctx: Ctx): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: { companyId: ctx.companyId },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

export interface MaterialsStats {
  totalItems: number;
  lowStockCount: number;
  openPOs: number;
  stockValue: number | null; // Σ on-hand × purchasePrice — sell... cost-side, admin-only
}

/**
 * Header KPIs. The LIST no longer scans the ledger (it derives per-page); this does
 * one FULL pass over StockMovement per load to compute low-stock + valuation.
 * NOTE: not truly bounded — StockMovement grows without limit, so this is the
 * remaining O(all-movements) read. Fine at current volume; the eventual fix is a
 * materialized stock-balance snapshot (tracked as a P2 scaling item). `stockValue`
 * is admin-only.
 */
export async function materialsStats(ctx: Ctx): Promise<MaterialsStats> {
  const [items, movements, openPOs] = await Promise.all([
    prisma.item.findMany({ where: { companyId: ctx.companyId }, select: { id: true, reorderLevel: true, purchasePrice: true } }),
    prisma.stockMovement.findMany({
      where: { companyId: ctx.companyId },
      select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true },
    }),
    prisma.purchaseOrder.count({ where: { companyId: ctx.companyId, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } } }),
  ]);
  const balances = deriveBalances(movements as MovementLike[]);
  let lowStockCount = 0;
  let stockValue = new Decimal(0);
  for (const i of items) {
    const total = balances.get(i.id)?.total ?? new Decimal(0);
    if (total.lt(new Decimal(i.reorderLevel))) lowStockCount += 1;
    if (i.purchasePrice) stockValue = stockValue.plus(total.times(new Decimal(i.purchasePrice)));
  }
  return {
    totalItems: items.length,
    lowStockCount,
    openPOs,
    stockValue: ctx.role === "ADMIN" ? Math.round(stockValue.toNumber()) : null,
  };
}

export async function createItem(
  ctx: Ctx,
  data: { name: string; category: string; unit: string; specification?: string; reorderLevel?: number; purchasePrice?: number },
) {
  requireAdmin(ctx); // masters are admin-managed
  const item = await prisma.item.create({
    data: {
      companyId: ctx.companyId,
      name: data.name,
      category: data.category,
      unit: data.unit,
      specification: data.specification,
      reorderLevel: new Decimal(data.reorderLevel ?? 0).toFixed(3),
      purchasePrice: data.purchasePrice != null ? new Decimal(data.purchasePrice).toFixed(2) : null,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Item", entityId: item.id });
  return item;
}

export interface MaterialsAnalytics {
  totalItems: number;
  lowStockCount: number;
  openPOs: number;
  stockValue: number | null; // Σ on-hand × purchasePrice — admin-only
  categoryValue: { category: string; value: number }[]; // stock value by category — admin-only ([] for EMPLOYEE)
  poAging: { bucket: string; count: number }[]; // open POs by age (counts — visible to all)
  vendorSpend: { vendor: string; spent: number }[]; // Σ non-draft PO value by vendor — admin-only ([] for EMPLOYEE)
  consumptionValue: number | null; // Σ CONSUME valueAtCost (issued to sites) — admin-only
  movementCounts: { type: string; count: number }[]; // ledger activity by type (visible to all)
}

/**
 * Inventory analytics (spec §7.4) — valuation, low-stock, PO-aging, vendor spend,
 * consumption. Company-wide. All ₹ surfaces (stockValue / categoryValue / vendorSpend
 * / consumptionValue) are admin-only (null/[] for EMPLOYEE), like amcAnalytics. Does
 * the same full-ledger pass as materialsStats — see the P2-6 snapshot note.
 */
export async function materialsAnalytics(ctx: Ctx): Promise<MaterialsAnalytics> {
  const now = Date.now();
  const isAdmin = ctx.role === "ADMIN";
  const [items, movements, pos] = await Promise.all([
    prisma.item.findMany({ where: { companyId: ctx.companyId }, select: { id: true, category: true, reorderLevel: true, purchasePrice: true } }),
    prisma.stockMovement.findMany({
      where: { companyId: ctx.companyId },
      select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true, valueAtCost: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: ctx.companyId },
      select: { status: true, totalValue: true, createdAt: true, vendor: { select: { name: true } } },
    }),
  ]);
  const balances = deriveBalances(movements as MovementLike[]);

  let lowStockCount = 0;
  let stockValue = new Decimal(0);
  const catValue = new Map<string, Decimal>();
  for (const i of items) {
    const total = balances.get(i.id)?.total ?? new Decimal(0);
    if (total.lt(new Decimal(i.reorderLevel))) lowStockCount += 1;
    if (i.purchasePrice) {
      const v = total.times(new Decimal(i.purchasePrice));
      stockValue = stockValue.plus(v);
      catValue.set(i.category, (catValue.get(i.category) ?? new Decimal(0)).plus(v));
    }
  }

  // Consumption ₹ — value issued to sites (CONSUME movements).
  let consumption = new Decimal(0);
  const movementCount = new Map<string, number>();
  for (const m of movements) {
    movementCount.set(m.type, (movementCount.get(m.type) ?? 0) + 1);
    if (m.type === "CONSUME" && m.valueAtCost) consumption = consumption.plus(new Decimal(m.valueAtCost));
  }

  // PO aging (open POs) + vendor spend (non-draft).
  const OPEN = new Set(["DRAFT", "SENT", "PARTIALLY_RECEIVED"]);
  const aging = { "≤7d": 0, "8–30d": 0, ">30d": 0 };
  const vendorSpend = new Map<string, Decimal>();
  let openPOs = 0;
  for (const p of pos) {
    if (OPEN.has(p.status)) {
      openPOs += 1;
      const ageDays = (now - p.createdAt.getTime()) / 86_400_000;
      if (ageDays <= 7) aging["≤7d"] += 1;
      else if (ageDays <= 30) aging["8–30d"] += 1;
      else aging[">30d"] += 1;
    }
    if (p.status !== "DRAFT") {
      const name = p.vendor.name;
      vendorSpend.set(name, (vendorSpend.get(name) ?? new Decimal(0)).plus(new Decimal(p.totalValue)));
    }
  }

  return {
    totalItems: items.length,
    lowStockCount,
    openPOs,
    stockValue: isAdmin ? Math.round(stockValue.toNumber()) : null,
    categoryValue: isAdmin
      ? [...catValue.entries()].map(([category, v]) => ({ category, value: Math.round(v.toNumber()) })).sort((a, b) => b.value - a.value)
      : [],
    poAging: Object.entries(aging).filter(([, c]) => c > 0).map(([bucket, count]) => ({ bucket, count })),
    vendorSpend: isAdmin
      ? [...vendorSpend.entries()].map(([vendor, v]) => ({ vendor, spent: Math.round(v.toNumber()) })).sort((a, b) => b.spent - a.spent).slice(0, 8)
      : [],
    consumptionValue: isAdmin ? Math.round(consumption.toNumber()) : null,
    movementCounts: [...movementCount.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  };
}

// ---------- Vendors ----------

export async function listVendors(ctx: Ctx, category?: string, take = 200) {
  const vendors = await prisma.vendor.findMany({
    where: { companyId: ctx.companyId, ...(category ? { categories: { has: category } } : {}) },
    orderBy: { name: "asc" },
    take: Math.min(take, 500),
  });
  return vendors;
}

export async function createVendor(
  ctx: Ctx,
  data: { name: string; phone: string; categories: string[]; gstin?: string; address?: string },
) {
  requireAdmin(ctx);
  const vendor = await prisma.vendor.create({ data: { companyId: ctx.companyId, ...data } });
  await logAudit(ctx, { action: "CREATE", entity: "Vendor", entityId: vendor.id, after: { name: data.name } });
  return vendor;
}

// ---------- Locations ----------

export async function listLocations(ctx: Ctx) {
  return prisma.location.findMany({ where: { companyId: ctx.companyId }, orderBy: { type: "asc" } });
}

// ---------- Purchase Orders (admin) ----------

export async function createPO(
  ctx: Ctx,
  data: { vendorId: string; destinationId: string; expectedDate: Date; items: { itemId: string; qty: number; rate: number }[] },
) {
  requireAdmin(ctx);
  const total = data.items.reduce<Decimal>((a, i) => a.plus(new Decimal(i.qty).times(i.rate)), new Decimal(0));
  const year = new Date().getFullYear();
  return prisma.$transaction(async (tx) => {
    const poNo = await allocateNumber(tx, ctx.companyId, "PO", year);
    const po = await tx.purchaseOrder.create({
      data: {
        companyId: ctx.companyId,
        poNo,
        vendorId: data.vendorId,
        destinationId: data.destinationId,
        expectedDate: data.expectedDate,
        status: "DRAFT",
        items: data.items as Prisma.InputJsonValue,
        totalValue: total.toFixed(2),
        pdfUrl: null,
        createdById: ctx.userId,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "PurchaseOrder", entityId: po.id, after: { poNo } }, tx);
    return { poId: po.id, poNo };
  });
}

export async function setPOStatus(ctx: Ctx, poId: string, status: "SENT" | "CLOSED") {
  requireAdmin(ctx);
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, companyId: ctx.companyId } });
  if (!po) throw new Error("PO not found");
  const updated = await prisma.purchaseOrder.update({ where: { id: poId }, data: { status } });
  await logAudit(ctx, { action: "UPDATE", entity: "PurchaseOrder", entityId: poId, before: { status: po.status }, after: { status } });
  return updated;
}

export async function listPOs(ctx: Ctx, take = 100) {
  requireAdmin(ctx); // POs carry rates → admin-only
  return prisma.purchaseOrder.findMany({
    where: { companyId: ctx.companyId },
    include: { vendor: { select: { name: true } }, grns: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  });
}

/**
 * Receive a GRN (spec §7.4): partial allowed, posts StockMovement(GRN → destination)
 * per line, records VendorPrice history, advances PO status.
 */
export async function receiveGRN(
  ctx: Ctx,
  poId: string,
  items: { itemId: string; receivedQty: number }[],
  challanUrl?: string,
) {
  requireAdmin(ctx);
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new Error("PO not found");
  const poItems = (po.items as Array<{ itemId: string; qty: number; rate: number }>) ?? [];

  const year = new Date().getFullYear();
  return prisma.$transaction(async (tx) => {
    const grnNo = await allocateNumber(tx, ctx.companyId, "GRN", year);
    const grn = await tx.gRN.create({
      data: { grnNo, poId, items: items as Prisma.InputJsonValue, challanUrl, receivedById: ctx.userId },
    });

    for (const line of items) {
      if (line.receivedQty <= 0) continue;
      const poLine = poItems.find((p) => p.itemId === line.itemId);
      const cost = poLine ? new Decimal(poLine.rate).times(line.receivedQty) : null;
      await tx.stockMovement.create({
        data: {
          companyId: ctx.companyId,
          itemId: line.itemId,
          qty: new Decimal(line.receivedQty).toFixed(3),
          type: "GRN",
          toLocationId: po.destinationId,
          refDocType: "GRN",
          refDocId: grn.id,
          valueAtCost: cost ? cost.toFixed(2) : null,
          createdById: ctx.userId,
        },
      });
      if (poLine) {
        await tx.vendorPrice.create({
          data: { itemId: line.itemId, vendorId: po.vendorId, rate: new Decimal(poLine.rate).toFixed(2), poId },
        });
      }
    }

    // Advance PO status (partial vs full).
    const totalOrdered = poItems.reduce((a, p) => a + p.qty, 0);
    const priorGrns = await tx.gRN.findMany({ where: { poId } });
    const totalReceived = priorGrns
      .flatMap((g) => (g.items as Array<{ receivedQty: number }>) ?? [])
      .reduce((a, x) => a + (x.receivedQty ?? 0), 0);
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: totalReceived >= totalOrdered ? "RECEIVED" : "PARTIALLY_RECEIVED" },
    });

    await logAudit(ctx, { action: "CREATE", entity: "GRN", entityId: grn.id, after: { poId, grnNo } }, tx);
    return { grnId: grn.id, grnNo };
  });
}

// ---------- Transfers & consumption ----------

/** On-hand for one item at one location (derived from the scoped ledger). */
async function onHandAt(companyId: string, itemId: string, locationId: string): Promise<Decimal> {
  const movements = await prisma.stockMovement.findMany({
    where: { companyId, itemId },
    select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true },
  });
  return deriveItemBalances(movements as MovementLike[]).byLocation.get(locationId) ?? new Decimal(0);
}

export async function transferStock(
  ctx: Ctx,
  data: { itemId: string; qty: number; fromLocationId: string; toLocationId: string; note?: string },
) {
  requireAdmin(ctx);
  const qty = new Decimal(data.qty).toFixed(3);
  // Over-issue guard: can't move more than the source location holds (no negatives).
  const available = await onHandAt(ctx.companyId, data.itemId, data.fromLocationId);
  if (new Decimal(qty).gt(available)) {
    throw new Error(`Only ${available.toString()} in stock at the source location — cannot transfer ${qty}`);
  }
  return prisma.$transaction(async (tx) => {
    const out = await tx.stockMovement.create({
      data: { companyId: ctx.companyId, itemId: data.itemId, qty, type: "TRANSFER_OUT", fromLocationId: data.fromLocationId, refDocType: "TRANSFER", note: data.note, createdById: ctx.userId },
    });
    await tx.stockMovement.create({
      data: { companyId: ctx.companyId, itemId: data.itemId, qty, type: "TRANSFER_IN", toLocationId: data.toLocationId, refDocType: "TRANSFER", refDocId: out.id, note: data.note, createdById: ctx.userId },
    });
    await logAudit(ctx, { action: "CREATE", entity: "StockMovement", entityId: out.id, after: { type: "TRANSFER", itemId: data.itemId, qty } }, tx);
    return { ok: true };
  });
}

/** Issue/consume to site → CONSUME with valueAtCost = purchasePrice (→ erection actuals). */
export async function consumeStock(
  ctx: Ctx,
  data: { itemId: string; qty: number; fromLocationId: string; note?: string },
) {
  requireAdmin(ctx);
  // Over-issue guard: can't consume more than the site holds (no negatives).
  const available = await onHandAt(ctx.companyId, data.itemId, data.fromLocationId);
  if (new Decimal(data.qty).gt(available)) {
    throw new Error(`Only ${available.toString()} in stock at this location — cannot issue ${data.qty}`);
  }
  const item = await prisma.item.findUnique({ where: { id: data.itemId } });
  const valueAtCost = item?.purchasePrice ? new Decimal(item.purchasePrice).times(data.qty).toFixed(2) : null;
  const mv = await prisma.stockMovement.create({
    data: {
      companyId: ctx.companyId,
      itemId: data.itemId,
      qty: new Decimal(data.qty).toFixed(3),
      type: "CONSUME",
      fromLocationId: data.fromLocationId,
      refDocType: "ERECTION",
      valueAtCost,
      note: data.note,
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "StockMovement", entityId: mv.id, after: { type: "CONSUME", itemId: data.itemId, qty: data.qty } });
  return { ok: true };
}

// ---------- Material requests (employee, NO prices) ----------

export async function createMaterialRequest(ctx: Ctx, orderId: string, items: { itemId: string; qty: number }[]) {
  const req = await prisma.materialRequest.create({
    data: { orderId, items: items as Prisma.InputJsonValue, requestedById: ctx.userId, status: "PENDING" },
  });
  await logAudit(ctx, { action: "CREATE", entity: "MaterialRequest", entityId: req.id, after: { orderId } });
  return req;
}

/**
 * Advance a material request's lifecycle — makes CONVERTED_PO / TRANSFERRED /
 * REJECTED reachable (they were dead: only PENDING was ever written). Admin only,
 * audited. Copy of setLeadStatus/setOrderStatus for the dead-status class.
 */
export async function setRequestStatus(
  ctx: Ctx,
  requestId: string,
  status: "PENDING" | "CONVERTED_PO" | "TRANSFERRED" | "REJECTED",
) {
  requireAdmin(ctx);
  const req = await prisma.materialRequest.findFirst({ where: { id: requestId, order: { companyId: ctx.companyId } } });
  if (!req) throw new Error("Request not found");
  const updated = await prisma.materialRequest.update({ where: { id: requestId }, data: { status } });
  await logAudit(ctx, { action: "UPDATE", entity: "MaterialRequest", entityId: requestId, before: { status: req.status }, after: { status } });
  return updated;
}

export async function listMaterialRequests(ctx: Ctx, take = 100) {
  return prisma.materialRequest.findMany({
    where: { order: { companyId: ctx.companyId } },
    include: { order: { select: { orderNo: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  });
}

// ---------- Low stock digest ----------

export async function lowStockItems(ctx: Ctx) {
  const [items, movements] = await Promise.all([
    prisma.item.findMany({ where: { companyId: ctx.companyId } }),
    prisma.stockMovement.findMany({
      where: { companyId: ctx.companyId },
      select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true },
    }),
  ]);
  const balances = deriveBalances(movements as MovementLike[]);
  const reorder = new Map(items.map((i) => [i.id, new Decimal(i.reorderLevel)]));
  const low = belowReorder(balances, reorder);
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  return low.map((l) => ({ item: nameOf.get(l.itemId) ?? l.itemId, balance: l.balance.toString(), reorderLevel: l.reorderLevel.toString() }));
}

// ---------- Stock audit (variance → ADJUST) ----------

export async function stockAudit(
  ctx: Ctx,
  locationId: string,
  counts: { itemId: string; countedQty: number }[],
) {
  requireAdmin(ctx);
  const movements = await prisma.stockMovement.findMany({
    where: { companyId: ctx.companyId },
    select: { itemId: true, qty: true, type: true, fromLocationId: true, toLocationId: true },
  });
  const balances = deriveBalances(movements as MovementLike[]);
  const adjustments: { itemId: string; variance: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const c of counts) {
      const current = balances.get(c.itemId)?.byLocation.get(locationId) ?? new Decimal(0);
      const variance = new Decimal(c.countedQty).minus(current);
      if (variance.isZero()) continue;
      // Positive variance credits the location; negative debits it.
      await tx.stockMovement.create({
        data: {
          companyId: ctx.companyId,
          itemId: c.itemId,
          qty: variance.abs().toFixed(3),
          type: "ADJUST",
          ...(variance.isPositive() ? { toLocationId: locationId } : { fromLocationId: locationId }),
          refDocType: "AUDIT",
          note: `Stock audit — responsible ${ctx.userId}`,
          createdById: ctx.userId,
        },
      });
      adjustments.push({ itemId: c.itemId, variance: variance.toFixed(3) });
    }
    if (adjustments.length) {
      // Audit the count event against the Location (entityId is a location, not a movement).
      await logAudit(ctx, { action: "UPDATE", entity: "Location", entityId: locationId, after: { event: "STOCK_AUDIT", adjustments: adjustments.length } }, tx);
    }
  });
  return { adjustments };
}

export { env };
