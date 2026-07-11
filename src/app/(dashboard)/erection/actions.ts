"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createErectionEntry, reviewEntry, acknowledgeOverrun } from "@/server/services/erection";

export async function createEntryAction(data: unknown) {
  const s = await getSession();
  await createErectionEntry(s, data as Parameters<typeof createErectionEntry>[1]);
  revalidatePath("/erection");
  return { ok: true };
}

export async function reviewEntryAction(entryId: string, action: "APPROVE" | "QUERY" | "REJECT", note?: string) {
  const s = await getSession();
  await reviewEntry(s, entryId, action, note);
  revalidatePath("/erection");
  return { ok: true };
}

export async function acknowledgeOverrunAction(orderId: string, note: string) {
  const s = await getSession();
  await acknowledgeOverrun(s, orderId, note);
  revalidatePath("/erection");
  return { ok: true };
}
