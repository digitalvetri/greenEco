import type { Role } from "@prisma/client";

/**
 * RBAC & FIELD STRIPPING (spec §6) — NON-NEGOTIABLE.
 *
 * EMPLOYEE responses must NEVER contain purchase prices, cost estimates,
 * margins, budgets, PO rates/totals, or receivables aggregates. This is enforced
 * server-side in the service return path, not in the UI.
 *
 * Design note on the `rate` ambiguity:
 *   - BOQItem.rate is the SELL rate — employees MAY see it.
 *   - PurchaseOrder line rate + VendorPrice.rate are PURCHASE rates — hidden.
 * A blanket "strip every key named rate" would wrongly hide sell prices, so we
 * (a) strip only unambiguous admin-only keys generically, and
 * (b) treat wholly-admin entities (PurchaseOrder, VendorPrice, Budget, Receipt)
 *     as capability-gated — services simply do not return them to EMPLOYEE.
 */

export interface Ctx {
  userId: string;
  role: Role;
  companyId: string;
}

/** Keys that are cost/margin/budget and must be absent from EMPLOYEE JSON. */
export const ADMIN_ONLY_KEYS: ReadonlySet<string> = new Set([
  "purchasePrice",
  "estimatedCost",
  "valueAtCost",
  "totalValue",
  "baseAmount",
  "adjustments", // Budget.adjustments
  "annualValue", // ServiceContract (AMC) value
  "amcAnnualRevenue",
  "margin",
  "grossMargin",
  "marginPct",
  "minMarginPct",
  "committed", // budget committed (open POs)
  "budget",
  "purchaseRate",
  "vendorPrices",
]);

/** Capability flags derived from role. */
export function can(role: Role) {
  const admin = role === "ADMIN";
  return {
    seePricing: admin,
    approveProposal: admin,
    convertWon: admin,
    manageReceipts: admin,
    manageInvoices: admin,
    managePO: admin,
    seePurchaseOrders: admin,
    seeVendorPrices: admin,
    adjustStock: admin,
    approveErection: admin,
    manageUsers: admin,
    editSettings: admin,
    seeBudget: admin,
    seeReceivables: admin,
  };
}

export function isAdmin(ctx: Ctx): boolean {
  return ctx.role === "ADMIN";
}

/** decimal.js / Prisma.Decimal instances have toFixed — treat as leaves. */
function isLeaf(v: unknown): boolean {
  if (v === null || typeof v !== "object") return true;
  if (v instanceof Date) return true;
  // Decimal-like
  if (typeof (v as { toFixed?: unknown }).toFixed === "function") return true;
  return false;
}

/**
 * Deep-strip admin-only keys for EMPLOYEE. ADMIN passes through untouched.
 * Returns a structurally cloned copy; input is not mutated.
 */
export function stripPricing<T>(data: T, role: Role): T {
  if (role === "ADMIN") return data;
  return walk(data) as T;
}

function walk(value: unknown): unknown {
  if (isLeaf(value)) return value;

  if (Array.isArray(value)) {
    return value.map(walk);
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (ADMIN_ONLY_KEYS.has(key)) continue; // drop entirely
    out[key] = walk(val);
  }
  return out;
}

/**
 * PurchaseOrder is admin-only; if one must ever be surfaced to an employee-facing
 * view (e.g. a delivery challan preview), strip the per-line rate + totals here.
 */
export function stripPurchaseOrderPricing<T extends { items?: unknown; totalValue?: unknown }>(
  po: T,
  role: Role,
): T {
  if (role === "ADMIN") return po;
  const clone: Record<string, unknown> = { ...po };
  delete clone.totalValue;
  if (Array.isArray(clone.items)) {
    clone.items = (clone.items as Array<Record<string, unknown>>).map((line) => {
      const l = { ...line };
      delete l.rate;
      return l;
    });
  }
  return clone as unknown as T;
}
