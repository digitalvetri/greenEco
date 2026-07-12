/**
 * Verifies Wave 4 A11 (low-stock → draft PO) + A12 (request routing). A11: an item with a
 * vendor price forced below reorder yields a DRAFT PO covering it (skipped if already on an
 * open PO). A12: routeMaterialRequest returns a transfer/PO suggestion per item. Reverts all.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { runAutomation } from "@/server/automations/engine";
import { registerAll } from "@/server/automations";
import { routeMaterialRequest } from "@/server/automations/material-request-routing";

async function main() {
  registerAll();
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  // Find an item that has a vendor price and is NOT already on an open PO.
  const openPOs = await prisma.purchaseOrder.findMany({ where: { companyId: A.companyId, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } }, select: { items: true } });
  const onOpen = new Set<string>();
  for (const po of openPOs) for (const it of (po.items as { itemId: string }[]) ?? []) onOpen.add(it.itemId);
  const vp = await prisma.vendorPrice.findFirst({ where: { item: { companyId: A.companyId, id: { notIn: [...onOpen] } } }, select: { itemId: true } });
  if (!vp) throw new Error("need a vendor-priced item not on an open PO");

  const item = await prisma.item.findUnique({ where: { id: vp.itemId }, select: { reorderLevel: true } });
  const restore = { itemId: vp.itemId, reorderLevel: item!.reorderLevel };
  const createdPoIds: string[] = [];
  try {
    // Force it below reorder.
    await prisma.item.update({ where: { id: vp.itemId }, data: { reorderLevel: 999999 } });
    const before = new Date();
    const r = await runAutomation("low-stock-po", { companyId: A.companyId, now: new Date(), dryRun: false });
    check("A11 creates at least one draft PO", ((r.details as { draftPOs?: number })?.draftPOs ?? 0) >= 1);
    const pos = await prisma.purchaseOrder.findMany({ where: { companyId: A.companyId, status: "DRAFT", createdAt: { gte: before } } });
    createdPoIds.push(...pos.map((p) => p.id));
    const coversItem = pos.some((p) => ((p.items as { itemId: string }[]) ?? []).some((i) => i.itemId === vp.itemId));
    check("draft PO covers the low item", coversItem);

    // A12 routing for a fresh request.
    const order = await prisma.order.findFirst({ where: { companyId: A.companyId, deletedAt: null }, select: { id: true } });
    const req = await prisma.materialRequest.create({ data: { orderId: order!.id, items: [{ itemId: vp.itemId, qty: 5 }], requestedById: admin.id, status: "PENDING" } });
    try {
      const routes = await routeMaterialRequest(A, req.id);
      check("A12 returns a routing suggestion", !!routes && routes.length === 1 && /TRANSFER|PO|PARTIAL/.test(routes[0].suggestion));
    } finally {
      await prisma.materialRequest.delete({ where: { id: req.id } });
    }
  } finally {
    if (createdPoIds.length) await prisma.purchaseOrder.deleteMany({ where: { id: { in: createdPoIds } } });
    await prisma.automationLog.deleteMany({ where: { name: "low-stock-po", dedupeKey: { startsWith: "dry:" } } });
    await prisma.item.update({ where: { id: restore.itemId }, data: { reorderLevel: restore.reorderLevel } });
  }

  console.log(`\n✅ Wave 4 (A11 + A12) verified — ${pass} checks passed`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
