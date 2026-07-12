import { prisma } from "@/lib/prisma";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * Automation registry + runner (AUTOMATION-ENGINE-SPEC §1.2). Automations self-register
 * via `register()`; `runAutomation(name)` enforces the per-automation kill switch, then
 * delegates. Scheduled automations map 1:1 to /api/cron?job=<name>; event-driven ones are
 * called directly from services.
 */

const registry = new Map<string, Automation>();

export function register(a: Automation): void {
  registry.set(a.name, a);
}

export function getAutomation(name: string): Automation | undefined {
  return registry.get(name);
}

export function allAutomations(): Automation[] {
  return [...registry.values()];
}

export function scheduledNames(): string[] {
  return allAutomations()
    .filter((a) => a.schedule)
    .map((a) => a.name);
}

export async function runAutomation(name: string, ctx: AutomationContext): Promise<AutomationResult> {
  const a = registry.get(name);
  if (!a) return { name, sent: 0, skipped: 0, details: { error: "unknown automation" } };
  if (!(await isEnabled(ctx.companyId, a.id))) {
    return { name, sent: 0, skipped: 0, details: { disabled: true } };
  }
  return a.run(ctx);
}

// ─── Settings (kill switch + parameters) ─────────────────────────────────────

export async function getSetting<T>(companyId: string, key: string, fallback: T): Promise<T> {
  const row = await prisma.automationSetting.findUnique({ where: { companyId_key: { companyId, key } } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(companyId: string, key: string, value: unknown): Promise<void> {
  await prisma.automationSetting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, value: value as never },
    update: { value: value as never },
  });
}

export function isEnabled(companyId: string, id: string): Promise<boolean> {
  return getSetting(companyId, `${id}.enabled`, true);
}

export function adminPhones(companyId: string): Promise<string[]> {
  return getSetting<string[]>(companyId, "adminPhones", []);
}
