import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lowStockItems, createPO } from "@/server/services/materials";
import { deliver } from "./deliver";
import { adminPhones, getSetting } from "./engine";
import { yearWeek } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A11 · Low stock → draft PO (08:00). Groups low items by best vendor (lowest of the last
 * 3 VendorPrices) and creates one DRAFT PurchaseOrder per vendor to Main Warehouse, qty =
 * reorderLevel × multiplier − balance. Skips items already on an open PO. Admin summary.
 * Replaces the legacy lowstock digest. (SPEC §6 A11)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };
  const low = await lowStockItems(sysCtx);
  const week = yearWeek(ctx.now);
  const multiplier = await getSetting<number>(ctx.companyId, "A11.restockMultiplier", 2);

  let considered = 0;
  let draftPOs = 0;
  if (low.length) {
    const openPOs = await prisma.purchaseOrder.findMany({
      where: { companyId: ctx.companyId, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } },
      select: { items: true },
    });
    const onOpen = new Set<string>();
    for (const po of openPOs) for (const it of (po.items as { itemId: string }[]) ?? []) onOpen.add(it.itemId);

    const dest = await prisma.location.findFirst({ where: { companyId: ctx.companyId, type: "WAREHOUSE" }, orderBy: { name: "asc" } });
    if (dest) {
      const byVendor = new Map<string, { itemId: string; qty: number; rate: number }[]>();
      for (const l of low) {
        if (onOpen.has(l.itemId)) continue;
        const prices = await prisma.vendorPrice.findMany({ where: { itemId: l.itemId }, orderBy: { date: "desc" }, take: 3 });
        if (!prices.length) continue;
        const best = prices.reduce((a, b) => (new Decimal(b.rate).lt(a.rate) ? b : a));
        const qty = Math.max(1, Math.ceil(Number(l.reorderLevel) * multiplier - Number(l.balance)));
        (byVendor.get(best.vendorId) ?? byVendor.set(best.vendorId, []).get(best.vendorId)!).push({ itemId: l.itemId, qty, rate: Number(best.rate) });
        considered++;
      }
      if (!ctx.dryRun) {
        for (const [vendorId, items] of byVendor) {
          await createPO(sysCtx, { vendorId, destinationId: dest.id, expectedDate: new Date(Date.now() + 7 * 86_400_000), items });
          draftPOs++;
        }
      } else {
        draftPOs = byVendor.size;
      }
    }
  }

  let sent = 0;
  let skipped = 0;
  if (low.length) {
    const body = `📦 Low stock: ${low.length} item(s). ${draftPOs} draft PO(s) created → ${env.appUrl}/materials`;
    for (const admin of await adminPhones(ctx.companyId)) {
      const r = await deliver({ name: "low-stock-po", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body, dedupeKey: `A11:summary:${admin}:${week}`, dryRun: ctx.dryRun });
      if (r.sent) sent++;
      if (r.skipped) skipped++;
    }
  }

  return { name: "low-stock-po", sent, skipped, details: { lowItems: low.length, considered, draftPOs } };
}

export const lowStockPo: Automation = {
  id: "A11",
  name: "low-stock-po",
  label: "Low stock → draft PO",
  schedule: "08:00 daily",
  run,
};
