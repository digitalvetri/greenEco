"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { markNotificationRead, markAllNotificationsRead, dismissNotification } from "@/server/services/notifications";

export async function markNotificationReadAction(id: string) {
  const session = await getSession();
  const res = await markNotificationRead(session, id);
  revalidatePath("/notifications");
  return res;
}

export async function markAllNotificationsReadAction() {
  const session = await getSession();
  const res = await markAllNotificationsRead(session);
  revalidatePath("/notifications");
  return res;
}

export async function dismissNotificationAction(id: string) {
  const session = await getSession();
  const res = await dismissNotification(session, id);
  revalidatePath("/notifications");
  return res;
}
