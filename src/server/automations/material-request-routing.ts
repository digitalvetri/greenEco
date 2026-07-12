import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { itemLocationBalances } from "@/server/services/materials";
import { deliver } from "./deliver";
import { adminPhones, isEnabled } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";
import type { Ctx } from "@/lib/rbac";

/**
 * A12 · Material request routing (event-driven, on MaterialRequest create). For each item,
 * checks on-hand across locations and suggests TRANSFER / RAISE PO / PARTIAL, then notifies
 * admin. No prices ever appear in the employee-visible request. (SPEC §6 A12)
 */
export interface RouteSuggestion {
  item: string;
  requested: number;
  suggestion: string;
}

export async function routeMaterialRequest(ctx: { companyId: string }, requestId: string): Promise<RouteSuggestion[] | null> {
  const req = await prisma.materialRequest.findFirst({ where: { id: requestId, order: { companyId: ctx.companyId } } });
  if (!req) return null;
  const items = ((req.items as { itemId: string; qty: number }[]) ?? []).filter((i) => i.itemId);
  if (!items.length) return [];

  const [itemRows, locRows] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: items.map((i) => i.itemId) } }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } }),
  ]);
  const itemName = new Map(itemRows.map((i) => [i.id, i.name]));
  const locName = new Map(locRows.map((l) => [l.id, l.name]));

  const out: RouteSuggestion[] = [];
  for (const it of items) {
    const balances = (await itemLocationBalances(ctx.companyId, it.itemId)).sort((a, b) => Number(b.qty) - Number(a.qty));
    const total = balances.reduce((a, b) => a + Number(b.qty), 0);
    const best = balances[0];
    let suggestion: string;
    if (best && Number(best.qty) >= it.qty) suggestion = `TRANSFER from ${locName.get(best.locationId) ?? "warehouse"} (${best.qty} available)`;
    else if (total <= 0) suggestion = "RAISE PO (no stock)";
    else suggestion = `PARTIAL: transfer ${total}, PO ${it.qty - total}`;
    out.push({ item: itemName.get(it.itemId) ?? it.itemId, requested: it.qty, suggestion });
  }
  return out;
}

export async function onMaterialRequestCreated(ctx: Ctx, requestId: string, dryRun = false): Promise<void> {
  if (!(await isEnabled(ctx.companyId, "A12"))) return;
  const routes = await routeMaterialRequest(ctx, requestId);
  if (!routes || !routes.length) return;
  const body = `🔧 New material request:\n${routes.map((r) => `${r.requested}× ${r.item} → ${r.suggestion}`).join("\n")}\n${env.appUrl}/materials`;
  for (const admin of await adminPhones(ctx.companyId)) {
    await deliver({ name: "material-request-routing", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A12:${requestId}:${admin}`, dryRun });
  }
}

/** Registry stub — event-driven; present for the kill switch + Settings row. */
async function run(_ctx: AutomationContext): Promise<AutomationResult> {
  return { name: "material-request-routing", sent: 0, skipped: 0, details: { eventDriven: "runs on material-request create" } };
}

export const materialRequestRouting: Automation = {
  id: "A12",
  name: "material-request-routing",
  label: "Material request routing",
  run,
};
