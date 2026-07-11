import type { VisitStatus, TicketPriority } from "@prisma/client";

/**
 * AMC / O&M pure domain logic (spec §Phase 5 — AMC/service).
 * Preventive-maintenance scheduling, visit-status engine, ticket SLA, contract
 * status. All pure & unit-tested; DB/service layer builds on top.
 */

const DAY = 86_400_000;

/** Evenly-spaced preventive-maintenance dates across the contract window. */
export function generateVisitSchedule(start: Date, end: Date, visitsPerYear: number): Date[] {
  const perYear = Math.max(1, Math.round(visitsPerYear));
  const intervalDays = Math.round(365 / perYear);
  const dates: Date[] = [];
  // First PM visit lands one interval after commissioning/handover, then repeats.
  for (let d = start.getTime() + intervalDays * DAY; d <= end.getTime() + DAY; d += intervalDays * DAY) {
    dates.push(new Date(d));
  }
  // Guarantee at least one scheduled visit for very short contracts.
  if (dates.length === 0) dates.push(new Date(Math.min(start.getTime() + intervalDays * DAY, end.getTime())));
  return dates;
}

/** DONE once completed; DUE within the grace window; MISSED once well past; else UPCOMING. */
export function visitStatusFor(
  scheduledDate: Date,
  actualDate: Date | null | undefined,
  now: Date = new Date(),
  graceDays = 7,
): VisitStatus {
  if (actualDate) return "DONE";
  const t = now.getTime();
  const sched = scheduledDate.getTime();
  if (t < sched) return "UPCOMING";
  if (t <= sched + graceDays * DAY) return "DUE";
  return "MISSED";
}

/** SLA response window (hours) by ticket priority. */
export function slaHoursForPriority(priority: TicketPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 24;
    case "MEDIUM":
      return 72;
    case "LOW":
    default:
      return 168;
  }
}

export function slaDueDate(priority: TicketPriority, createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + slaHoursForPriority(priority) * 3_600_000);
}

/** True once the SLA window has elapsed on an unresolved ticket. */
export function isSlaBreached(slaDue: Date | null | undefined, resolved: boolean, now: Date = new Date()): boolean {
  if (resolved || !slaDue) return false;
  return now.getTime() > slaDue.getTime();
}

/** ACTIVE within the window, EXPIRED after end (CANCELLED/DRAFT are set manually). */
export function contractStatusFor(start: Date, end: Date, now: Date = new Date()): "ACTIVE" | "EXPIRED" {
  return now.getTime() > end.getTime() ? "EXPIRED" : "ACTIVE";
}

export function daysToExpiry(end: Date, now: Date = new Date()): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY);
}
