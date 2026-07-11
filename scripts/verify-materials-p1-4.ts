/** Verifies materialsAnalytics aggregation vs raw DB + RBAC on every ₹ surface. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { materialsAnalytics, materialsStats } from "@/server/services/materials";

const POKEY = "VERIFY-P14-PO";
const VKEY = "VERIFY-P14-VENDOR";
const DAY = 86_400_000;

async function cleanup() {
  await prisma.purchaseOrder.deleteMany({ where: { poNo: { startsWith: POKEY } } });
  await prisma.vendor.deleteMany({ where: { name: VKEY } });
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  const dest = await prisma.location.findFirst({ where: { companyId: A.companyId, type: "WAREHOUSE" } });
  if (!dest) throw new Error("need a warehouse");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  await cleanup();
  // Baselines (before fixtures) to assert deltas, so the test is robust to seed data.
  const before = await materialsAnalytics(A);
  const openBucketBefore = (b: string) => before.poAging.find((p) => p.bucket === b)?.count ?? 0;

  // 3 open POs at controlled ages → one per aging bucket; 2 non-draft feed vendor spend.
  const vendor = await prisma.vendor.create({ data: { companyId: A.companyId, name: VKEY, phone: "9000000000", categories: ["Civil"] } });
  const mkPO = (n: number, ageDays: number, status: "DRAFT" | "SENT", value: string) =>
    prisma.purchaseOrder.create({
      data: {
        companyId: A.companyId, poNo: `${POKEY}-${n}`, vendorId: vendor.id, destinationId: dest.id,
        expectedDate: new Date(), status, items: [], totalValue: value, createdById: A.userId,
        createdAt: new Date(Date.now() - ageDays * DAY),
      },
    });
  await mkPO(1, 3, "SENT", "10000.00"); // ≤7d
  await mkPO(2, 15, "SENT", "20000.00"); // 8–30d
  await mkPO(3, 45, "DRAFT", "30000.00"); // >30d

  const a = await materialsAnalytics(A);
  // Aging buckets now populated (delta = +1 each vs baseline).
  check("poAging ≤7d bucket +1 (3d-old PO)", (a.poAging.find((p) => p.bucket === "≤7d")?.count ?? 0) === openBucketBefore("≤7d") + 1);
  check("poAging 8–30d bucket +1 (15d-old PO)", (a.poAging.find((p) => p.bucket === "8–30d")?.count ?? 0) === openBucketBefore("8–30d") + 1);
  check("poAging >30d bucket +1 (45d-old PO)", (a.poAging.find((p) => p.bucket === ">30d")?.count ?? 0) === openBucketBefore(">30d") + 1);
  check("openPOs rose by exactly 3", a.openPOs === before.openPOs + 3);
  // Vendor spend: the 2 non-draft POs (10k + 20k) group under the fixture vendor.
  const fv = a.vendorSpend.find((v) => v.vendor === VKEY);
  check("vendorSpend groups the fixture vendor's non-draft POs (=30000)", fv?.spent === 30000);
  const stats = await materialsStats(A);

  const rawItems = await prisma.item.count({ where: { companyId: A.companyId } });
  const rawMovements = await prisma.stockMovement.count({ where: { companyId: A.companyId } });
  const rawOpenPOs = await prisma.purchaseOrder.count({ where: { companyId: A.companyId, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } } });

  check(`totalItems matches DB (${a.totalItems}==${rawItems})`, a.totalItems === rawItems);
  check("lowStockCount agrees with materialsStats", a.lowStockCount === stats.lowStockCount);
  check(`openPOs matches DB (${a.openPOs}==${rawOpenPOs})`, a.openPOs === rawOpenPOs);
  check("poAging buckets sum to openPOs", a.poAging.reduce((s, p) => s + p.count, 0) === a.openPOs);
  check(`movementCounts sum to raw movements (=${rawMovements})`, a.movementCounts.reduce((s, m) => s + m.count, 0) === rawMovements);

  // stockValue consistency + non-negative.
  check("stockValue agrees with materialsStats", a.stockValue === stats.stockValue);
  check("stockValue ≥ 0 for ADMIN", (a.stockValue ?? -1) >= 0);
  // Per-category values are each rounded, so Σ can differ from round(Σ) by ≤ #categories.
  check("categoryValue sums to stockValue (within rounding tolerance)", Math.abs(a.categoryValue.reduce((s, c) => s + c.value, 0) - (a.stockValue ?? 0)) <= a.categoryValue.length);
  check("consumptionValue ≥ 0 for ADMIN", (a.consumptionValue ?? -1) >= 0);

  // RBAC: every ₹ surface is admin-only.
  const e = await materialsAnalytics(E);
  check("EMPLOYEE stockValue is null", e.stockValue === null);
  check("EMPLOYEE categoryValue is empty", e.categoryValue.length === 0);
  check("EMPLOYEE vendorSpend is empty", e.vendorSpend.length === 0);
  check("EMPLOYEE consumptionValue is null", e.consumptionValue === null);
  check("EMPLOYEE still gets non-money analytics", e.totalItems === a.totalItems && e.openPOs === a.openPOs && e.movementCounts.length === a.movementCounts.length);
  check("EMPLOYEE payload leaks no ₹ surface", (() => { const j = JSON.stringify(e); return !j.includes("stockValue\":") || j.includes("stockValue\":null"); })());

  await cleanup();
  console.log(`\n✅ Materials/Inventory P1-4 (analytics) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
