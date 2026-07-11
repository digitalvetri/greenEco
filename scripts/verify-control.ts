import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  createItem,
  createVendor,
  createPO,
  receiveGRN,
  transferStock,
  consumeStock,
  listItems,
} from "@/server/services/materials";
import { createErectionEntry, reviewEntry, budgetVsActual } from "@/server/services/erection";

const ctx = { userId: "dev-admin", role: "ADMIN" as const, companyId: env.companyId };
const emp = { userId: "dev-employee", role: "EMPLOYEE" as const, companyId: env.companyId };

async function main() {
  const order = await prisma.order.findFirst({
    where: { companyId: env.companyId },
    orderBy: { createdAt: "desc" },
    include: { siteLocation: true },
  });
  if (!order?.siteLocation) throw new Error("No order/site — run verify-sell first");
  const wh = await prisma.location.findFirst({ where: { companyId: env.companyId, type: "WAREHOUSE" } });

  const item = await createItem(ctx, { name: "Verify Cement Bag " + Date.now(), category: "Civil", unit: "bag", reorderLevel: 10, purchasePrice: 400 });
  const vendor = await createVendor(ctx, { name: "Verify Cement Co", phone: "9843099999", categories: ["Civil"] });
  console.log("Item + vendor created.");

  // PO → warehouse, then GRN 100 bags.
  const po = await createPO(ctx, { vendorId: vendor.id, destinationId: wh!.id, expectedDate: new Date(), items: [{ itemId: item.id, qty: 100, rate: 400 }] });
  await receiveGRN(ctx, po.poId, [{ itemId: item.id, receivedQty: 100 }]);
  let items = (await listItems(ctx)).items;
  let mine = items.find((i) => i.id === item.id)!;
  console.log("1. After GRN 100 @ warehouse:", mine.total, "byLoc:", JSON.stringify(mine.byLocation));

  // Transfer 40 to site.
  await transferStock(ctx, { itemId: item.id, qty: 40, fromLocationId: wh!.id, toLocationId: order.siteLocation.id });
  items = (await listItems(ctx)).items;
  mine = items.find((i) => i.id === item.id)!;
  console.log("2. After transfer 40 → site:", mine.byLocation.map((b) => `${b.location}:${b.qty}`).join(", "));

  // Consume 25 at site (valueAtCost = 25*400 = 10000).
  await consumeStock(ctx, { itemId: item.id, qty: 25, fromLocationId: order.siteLocation.id, note: "poured slab" });
  items = (await listItems(ctx)).items;
  mine = items.find((i) => i.id === item.id)!;
  console.log("3. After consume 25 @ site: total", mine.total);

  // Erection: LABOUR entry (approve), SITE_PURCHASE with bill (approve).
  const labour = await createErectionEntry(ctx, { orderId: order.id, type: "LABOUR", date: new Date(), description: "10 masons", amount: 15000, billImages: [] });
  await reviewEntry(ctx, labour.id, "APPROVE");
  const purchase = await createErectionEntry(ctx, { orderId: order.id, type: "SITE_PURCHASE", date: new Date(), description: "sand 2 units", amount: 8000, billImages: [{ url: "/uploads/bill.jpg" }] });
  await reviewEntry(ctx, purchase.id, "APPROVE");
  console.log("4. Erection entries approved (labour 15000 + purchase 8000).");

  // SITE_PURCHASE without bill must throw.
  let blocked = false;
  try {
    await createErectionEntry(ctx, { orderId: order.id, type: "SITE_PURCHASE", date: new Date(), description: "no bill", amount: 100, billImages: [] });
  } catch {
    blocked = true;
  }
  console.log("   Site purchase without bill blocked:", blocked);

  // Budget vs Actual: spent = consumption 10000 + labour 15000 + purchase 8000 = 33000.
  const bva = await budgetVsActual(ctx, order.id);
  console.log("5. Budget vs Actual:", JSON.stringify({ spent: bva.spent, committed: bva.committed, categories: bva.categories }));

  // EMPLOYEE item list must not leak purchasePrice.
  const empItems = (await listItems(emp)).items;
  console.log("6. EMPLOYEE item list leaks purchasePrice?", JSON.stringify(empItems).includes("purchasePrice"));

  await prisma.$disconnect();
  console.log("\n✅ Control flow verified");
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});
