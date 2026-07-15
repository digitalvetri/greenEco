"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { setConfigValue, clearConfigValue } from "@/server/services/config-admin";

export async function saveConfigAction(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  try {
    const res = await setConfigValue(session, key, value);
    if (res.ok) revalidatePath("/settings/integrations");
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" };
  }
}

export async function clearConfigAction(key: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  try {
    const res = await clearConfigValue(session, key);
    if (res.ok) revalidatePath("/settings/integrations");
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to clear" };
  }
}
