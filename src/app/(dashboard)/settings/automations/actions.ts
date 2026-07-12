"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { toggleAutomation, runAutomationDryRun, saveAutomationSetting } from "@/server/services/automation-admin";
import type { AutomationResult } from "@/server/automations/types";

export async function toggleAutomationAction(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  try {
    await toggleAutomation(session, id, enabled);
    revalidatePath("/settings/automations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function runDryRunAction(name: string): Promise<{ ok: boolean; result?: AutomationResult; error?: string }> {
  const session = await getSession();
  try {
    const result = await runAutomationDryRun(session, name);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function saveAdminPhonesAction(phones: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  try {
    const list = phones
      .split(/[,\n]/)
      .map((s) => s.replace(/\D/g, ""))
      .filter((s) => s.length >= 10);
    await saveAutomationSetting(session, "adminPhones", list);
    revalidatePath("/settings/automations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
