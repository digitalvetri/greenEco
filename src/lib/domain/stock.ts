import { Decimal } from "decimal.js";
import type { MovementType } from "@prisma/client";

/**
 * Stock balance derivation from the IMMUTABLE movement ledger (spec §7.4).
 * Balances are never stored — always derived. Universal rule:
 *   a movement CREDITS toLocationId (+qty) and DEBITS fromLocationId (-qty).
 * This handles every MovementType uniformly:
 *   GRN/TRANSFER_IN/RETURN -> toLocation set (+)
 *   CONSUME/TRANSFER_OUT   -> fromLocation set (-)
 *   TRANSFER               -> both set (moves between locations)
 *   ADJUST                 -> set toLocation to add, fromLocation to remove
 */

export interface MovementLike {
  itemId: string;
  qty: Decimal.Value;
  type: MovementType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
}

export type LocationBalances = Map<string, Decimal>; // locationId -> qty

/** Balances for a single item across all locations. */
export function deriveItemBalances(movements: MovementLike[]): {
  total: Decimal;
  byLocation: LocationBalances;
} {
  const byLocation: LocationBalances = new Map();
  const credit = (loc: string | null | undefined, qty: Decimal) => {
    if (!loc) return;
    byLocation.set(loc, (byLocation.get(loc) ?? new Decimal(0)).plus(qty));
  };

  for (const m of movements) {
    const qty = new Decimal(m.qty);
    credit(m.toLocationId, qty);
    credit(m.fromLocationId, qty.negated());
  }

  let total = new Decimal(0);
  for (const v of byLocation.values()) total = total.plus(v);
  return { total, byLocation };
}

/** Balances for many items: itemId -> { total, byLocation }. */
export function deriveBalances(
  movements: MovementLike[],
): Map<string, { total: Decimal; byLocation: LocationBalances }> {
  const grouped = new Map<string, MovementLike[]>();
  for (const m of movements) {
    const list = grouped.get(m.itemId) ?? [];
    list.push(m);
    grouped.set(m.itemId, list);
  }
  const out = new Map<string, { total: Decimal; byLocation: LocationBalances }>();
  for (const [itemId, list] of grouped) {
    out.set(itemId, deriveItemBalances(list));
  }
  return out;
}

/** Items whose derived total balance is below their reorder level. */
export function belowReorder(
  balances: Map<string, { total: Decimal }>,
  reorderLevels: Map<string, Decimal.Value>,
): Array<{ itemId: string; balance: Decimal; reorderLevel: Decimal }> {
  const out: Array<{ itemId: string; balance: Decimal; reorderLevel: Decimal }> = [];
  for (const [itemId, level] of reorderLevels) {
    const reorderLevel = new Decimal(level);
    const balance = balances.get(itemId)?.total ?? new Decimal(0);
    if (balance.lt(reorderLevel)) out.push({ itemId, balance, reorderLevel });
  }
  return out;
}
