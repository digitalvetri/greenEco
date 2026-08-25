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
  "freight",
  "loadingCharges",
  "catalogFreight",
  "catalogLoadingCharges",
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
  "priceBreakdown", // derived from purchasePrice
  "poHistory", // PO rate/freight/loading — whole-object drop, same reasoning as PurchaseOrder itself
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

/* ------------------------------------------------------------------------- *
 * PER-USER CAPABILITIES
 *
 * The first authorization signal in this app that is not derived from `role`
 * alone. Before this, widening one employee's access meant promoting them to full
 * ADMIN — which also hands over pricing, margins, budgets, POs, vendor prices,
 * receipts, invoices, user management and settings. A capability grants exactly one
 * thing.
 *
 * Rules, deliberately narrow:
 *   • ADMIN implicitly holds every capability. `User.capabilities` is only ever
 *     consulted for non-admins, so an admin can never be locked out of their own
 *     workspace by an accidental empty array.
 *   • A capability only ever ADDS permission. Nothing here can take away what a role
 *     already allows, so no existing RBAC guarantee (least of all stripPricing) can
 *     be weakened by editing this array.
 *   • Unknown strings are inert — a capability removed from the allowlist in a future
 *     release degrades to "not granted" instead of crashing on stale rows.
 * ------------------------------------------------------------------------- */

/** The allowlist. A value not in here is ignored, even if stored on a user. */
export const CAPABILITIES = {
  /** Raise drawing requests and upload/deliver drawings. Viewing drawings on a
   *  project you're assigned to does NOT need this — site staff must still be able
   *  to open the layout they are building from. */
  DRAWINGS: "DRAWINGS",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Human labels for the Settings → Users checkboxes. */
export const CAPABILITY_LABELS: Record<Capability, { label: string; description: string }> = {
  DRAWINGS: {
    label: "Drawings",
    description:
      "Can request AutoCAD drawings and upload finished ones. Everyone can still view drawings on projects they're assigned to.",
  },
};

/** Ctx carrying the grants. Optional so every existing Ctx literal still type-checks. */
export interface CapabilityCtx extends Ctx {
  capabilities?: string[] | null;
}

export function hasCapability(ctx: CapabilityCtx, capability: Capability): boolean {
  if (ctx.role === "ADMIN") return true;
  return (ctx.capabilities ?? []).includes(capability);
}

/** Drop anything not in the allowlist, and de-duplicate. Used on the write path. */
export function sanitizeCapabilities(input: unknown): Capability[] {
  const valid = new Set<string>(Object.values(CAPABILITIES));
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((c): c is Capability => typeof c === "string" && valid.has(c)))];
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
export function stripPurchaseOrderPricing<T extends { items?: unknown; totalValue?: unknown; freight?: unknown; loadingCharges?: unknown }>(
  po: T,
  role: Role,
): T {
  if (role === "ADMIN") return po;
  const clone: Record<string, unknown> = { ...po };
  delete clone.totalValue;
  delete clone.freight;
  delete clone.loadingCharges;
  if (Array.isArray(clone.items)) {
    clone.items = (clone.items as Array<Record<string, unknown>>).map((line) => {
      const l = { ...line };
      delete l.rate;
      return l;
    });
  }
  return clone as unknown as T;
}
