import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { Ctx } from "@/lib/rbac";
import { registerAll } from "@/server/automations";
import { allAutomations, runAutomation, getSetting, setSetting } from "@/server/automations/engine";
import type { AutomationResult } from "@/server/automations/types";

/**
 * Admin surface for Settings → Automations (AUTOMATION-ENGINE-SPEC §8): list every
 * registered automation with its enabled state + last run, toggle the kill switch,
 * and trigger a dry-run. All admin-only + audited where it mutates config.
 */

export interface AutomationOverviewItem {
  id: string;
  name: string;
  label: string;
  schedule: string | null;
  enabled: boolean;
  lastRun: { at: string; status: string } | null;
}

export async function getAutomationsOverview(ctx: Ctx): Promise<AutomationOverviewItem[]> {
  requireAdmin(ctx);
  registerAll();
  const list = allAutomations();
  return Promise.all(
    list.map(async (a) => {
      const [enabled, last] = await Promise.all([
        getSetting(ctx.companyId, `${a.id}.enabled`, true),
        prisma.automationLog.findFirst({
          where: { companyId: ctx.companyId, name: a.name, dedupeKey: { not: { startsWith: "dry:" } } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, status: true },
        }),
      ]);
      return {
        id: a.id,
        name: a.name,
        label: a.label,
        schedule: a.schedule ?? null,
        enabled,
        lastRun: last ? { at: last.createdAt.toISOString(), status: last.status } : null,
      };
    }),
  );
}

export async function toggleAutomation(ctx: Ctx, id: string, enabled: boolean): Promise<{ ok: true }> {
  requireAdmin(ctx);
  await setSetting(ctx.companyId, `${id}.enabled`, enabled);
  await prisma.auditLog.create({
    data: { companyId: ctx.companyId, userId: ctx.userId, action: "UPDATE", entity: "AutomationSetting", entityId: `${id}.enabled`, after: { enabled } },
  });
  return { ok: true };
}

export async function runAutomationDryRun(ctx: Ctx, name: string): Promise<AutomationResult> {
  requireAdmin(ctx);
  registerAll();
  return runAutomation(name, { companyId: ctx.companyId, now: new Date(), dryRun: true });
}

/** Save a JSON parameter (e.g. adminPhones, A4.paymentDetails). Admin, audited. */
export async function saveAutomationSetting(ctx: Ctx, key: string, value: unknown): Promise<{ ok: true }> {
  requireAdmin(ctx);
  await setSetting(ctx.companyId, key, value);
  await prisma.auditLog.create({
    data: { companyId: ctx.companyId, userId: ctx.userId, action: "UPDATE", entity: "AutomationSetting", entityId: key, after: { value } as never },
  });
  return { ok: true };
}
