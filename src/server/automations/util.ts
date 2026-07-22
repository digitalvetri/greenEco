import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/** Shared date helpers for automations. Server stores UTC; "today" uses server-local
 *  midnight (matches the existing cron). IST helpers back the A4 quiet-hours rule. */

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** [startOfDay, startOfNextDay) around `now` (server-local). */
export function dayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: addDays(start, 1) };
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO week key yyyy-Www (for weekly dedupe). */
export function yearWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** yyyy-Qn quarter key (calendar quarters). */
export function yearQuarter(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/** Hour-of-day (0–23) in IST, regardless of the server's timezone. */
export function istHour(now: Date): number {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  return ist.getUTCHours();
}

export function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

export const BRAND_FOOTER = "— Green Ecocare Pvt Ltd";

/**
 * Single choke point for creating an AutomationTask (mirrors deliver.ts's role for
 * WhatsApp/email). Writes the row AND fires a best-effort Web Push to the assignee —
 * callers no longer need to know push exists. Dedup-checking (one OPEN task per
 * (type, entityId)) stays the caller's job, same as before; this only replaces the
 * final `prisma.automationTask.create` call.
 */
export async function createAutomationTask(input: {
  companyId: string;
  type: string;
  title: string;
  entity: string;
  entityId: string;
  assigneeId: string;
  dueDate?: Date | null;
  /** Relative in-app path the push notification opens on click, e.g. "/leads/abc123". */
  href?: string;
}): Promise<void> {
  await prisma.automationTask.create({
    data: {
      companyId: input.companyId,
      type: input.type,
      title: input.title,
      entity: input.entity,
      entityId: input.entityId,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ?? undefined,
    },
  });
  sendPushToUser(input.assigneeId, { title: input.title, body: "Tap to view in Green Ecocare CRM", url: input.href }).catch(() => {});
}
