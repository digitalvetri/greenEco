"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { completeFollowUp, rescheduleFollowUp } from "@/server/services/calendar";

export async function completeFollowUpAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    await completeFollowUp(session, id);
    revalidatePath("/calendar");
    revalidatePath("/follow-ups");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function rescheduleFollowUpAction(
  id: string,
  newDate: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    await rescheduleFollowUp(session, id, new Date(newDate), notes);
    revalidatePath("/calendar");
    revalidatePath("/follow-ups");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
