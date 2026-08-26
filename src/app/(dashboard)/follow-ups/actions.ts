"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { completeFollowUp, rescheduleFollowUp } from "@/server/services/calendar";
import { markNotificationRead, dismissNotification } from "@/server/services/notifications";

type Result = { ok: boolean; error?: string };

/** Both views live at /follow-ups, so one revalidate covers the module. */
function refresh() {
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
}

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function completeFollowUpAction(id: string): Promise<Result> {
  const session = await getSession();
  return run(() => completeFollowUp(session, id));
}

export async function rescheduleFollowUpAction(
  id: string,
  newDate: string,
  notes?: string,
): Promise<Result> {
  const session = await getSession();
  const when = new Date(newDate);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date" };
  return run(() => rescheduleFollowUp(session, id, when, notes));
}

/**
 * Auto-generated tasks are AutomationTask rows, not follow-ups — "done" and
 * "dismiss" already exist on the notifications service (both RBAC-scoped, and a row
 * outside the caller's scope is a silent no-op rather than an error). Reused rather
 * than reimplemented so a task can't be closable here but not from the bell.
 */
export async function completeTaskAction(id: string): Promise<Result> {
  const session = await getSession();
  return run(() => markNotificationRead(session, id));
}

export async function dismissTaskAction(id: string): Promise<Result> {
  const session = await getSession();
  return run(() => dismissNotification(session, id));
}
