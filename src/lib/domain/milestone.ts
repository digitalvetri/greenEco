import { Decimal } from "decimal.js";
import type { MilestoneStatus, StageStatus } from "@prisma/client";

/**
 * Payment milestone status engine (spec §7.3).
 *   dueBasis DATE            -> DUE when dueDate <= now
 *   dueBasis STAGE_COMPLETION-> DUE when the linked stage is DONE
 * Receipts drive PARTIALLY_PAID / PAID and take precedence over DUE/UPCOMING.
 */

export interface MilestoneInput {
  amount: Decimal.Value;
  dueBasis: "DATE" | "STAGE_COMPLETION";
  dueDate?: Date | null;
  linkedStageStatus?: StageStatus | null;
}

export function computeMilestoneStatus(
  m: MilestoneInput,
  receipts: Array<{ amount: Decimal.Value }>,
  now: Date = new Date(),
): MilestoneStatus {
  const amount = new Decimal(m.amount);
  const paid = receipts.reduce<Decimal>((acc, r) => acc.plus(r.amount), new Decimal(0));

  if (paid.gte(amount) && amount.gt(0)) return "PAID";
  if (paid.gt(0)) return "PARTIALLY_PAID";

  const isDue =
    m.dueBasis === "DATE"
      ? !!m.dueDate && m.dueDate.getTime() <= now.getTime()
      : m.linkedStageStatus === "DONE";

  return isDue ? "DUE" : "UPCOMING";
}

/** Days overdue for receivables reporting (0 if not past due / already paid). */
export function daysOverdue(dueDate: Date | null | undefined, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const ms = now.getTime() - dueDate.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}
