/**
 * Verifies Materials/Inventory P2 — GRN sequential numbering, the over-issue guard
 * on transfer/consume (no negative balances), and the now-live low-stock detection
 * (lowStockItems was dead code). Fixtures use fixed keys and are cleaned up.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { DEV_ADMIN_ID } from "@/lib/env";
import {
  createItem,
  createVendor,
  createPO,
  receiveGRN,
  transferStock,
  consumeStock,
  lowStockItems,
} from "@/server/services/materials";

const IKEY = "VERIFY-P2-ITEM";
const LKEY = "VERIFY-P2-LOWITEM";
const VKEY = "VERIFY-P2-VENDOR";

async function cleanup() {
  const vendor = await prisma.vendor.findFirst({ where: { name: VKEY } });
  if (vendor) {
    const pos = await prisma.purchaseOrder.findMany({ where: { vendorId: vendor.id }, select: { id: true } });
    if (pos.length) await prisma.gRN.deleteMany({ where: { poId: { in: pos.map((p) => p.id) } } });
    await prisma.purchaseOrder.deleteMany({ where: { vendorId: vendor.id } });
  }
  const items = await prisma.item.findMany({ where: { name: { in: [IKEY, LKEY] } }, select: { id: true } });
  const ids = items.map((i) => i.id);
  if (ids.length) {
    await prisma.vendorPrice.deleteMany({ where: { itemId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { itemId: { in: ids } } });
    await prisma.item.deleteMany({ where: { id: { in: ids } } });
  }
  if (vendor) await prisma.vendor.delete({ where: { id: vendor.id } });
}

async function expectThrow(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const wh = await prisma.location.findFirst({ where: { companyId: A.companyId, type: "WAREHOUSE" } });
  const site = await prisma.location.findFirst({ where: { companyId: A.companyId, id: { not: wh?.id } } });
  if (!wh || !site) throw new Error("need a warehouse + a second location");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  await cleanup();
  const item = await createItem(A, { name: IKEY, category: "VerifyCat", unit: "bag", reorderLevel: 0, purchasePrice: 400 });
  const vendor = await createVendor(A, { name: VKEY, phone: "9000000001", categories: ["Civil"] });

  // 1 — GRN gets a sequential number, formatted + unique + audited.
  const po1 = await createPO(A, { vendorId: vendor.id, destinationId: wh.id, expectedDate: new Date(), items: [{ itemId: item.id, qty: 50, rate: 400 }] });
  const grn1 = await receiveGRN(A, po1.poId, [{ itemId: item.id, receivedQty: 50 }]);
  check("receiveGRN returns a grnNo", !!grn1.grnNo);
  check("grnNo is formatted (GEC-GRN-YYYY-NNN)", /^GEC-GRN-\d{4}-\d+$/.test(grn1.grnNo!));
  const grnRow = await prisma.gRN.findUnique({ where: { id: grn1.grnId } });
  check("grnNo persisted on the GRN row", grnRow?.grnNo === grn1.grnNo);
  const grnAudit = await prisma.auditLog.findFirst({ where: { entity: "GRN", entityId: grn1.grnId, action: "CREATE" } });
  check("GRN audited with its number", !!grnAudit && ((grnAudit.after ?? {}) as Record<string, unknown>).grnNo === grn1.grnNo);

  const po2 = await createPO(A, { vendorId: vendor.id, destinationId: wh.id, expectedDate: new Date(), items: [{ itemId: item.id, qty: 10, rate: 400 }] });
  const grn2 = await receiveGRN(A, po2.poId, [{ itemId: item.id, receivedQty: 10 }]);
  check("second GRN gets a distinct sequential number", grn2.grnNo !== grn1.grnNo);

  // 2 — over-issue guard. Warehouse now holds 60 (50 + 10).
  check("transfer within on-hand succeeds (40 of 60)", (await transferStock(A, { itemId: item.id, qty: 40, fromLocationId: wh.id, toLocationId: site.id })).ok === true);
  // Warehouse now 20; site 40.
  check("over-transfer is blocked (100 > 20 at warehouse)", await expectThrow(() => transferStock(A, { itemId: item.id, qty: 100, fromLocationId: wh.id, toLocationId: site.id })));
  check("consume within on-hand succeeds (30 of 40 at site)", (await consumeStock(A, { itemId: item.id, qty: 30, fromLocationId: site.id })).ok === true);
  check("over-consume is blocked (50 > 10 at site)", await expectThrow(() => consumeStock(A, { itemId: item.id, qty: 50, fromLocationId: site.id })));

  // 3 — low-stock detection is live (was dead code). A high-reorder item with no stock is low.
  await createItem(A, { name: LKEY, category: "VerifyCat", unit: "nos", reorderLevel: 100 });
  const low = await lowStockItems(A);
  check("lowStockItems flags a below-reorder item (dead code now live)", low.some((l) => l.item === LKEY));

  await cleanup();
  console.log(`\n✅ Materials/Inventory P2 (GRN# + over-issue guard + low-stock) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
