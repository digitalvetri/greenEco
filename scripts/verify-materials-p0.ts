/**
 * Verifies Materials/Inventory P0 — item-list pagination + search + category
 * filter (scoped ledger scan), the CRITICAL RBAC purchasePrice stripping, the
 * materialsStats aggregation vs raw DB, and the newly-reachable MaterialRequest
 * lifecycle + audit. Fixtures use fixed keys and are cleaned up (idempotent).
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  listItems,
  materialsStats,
  materialCategories,
  createMaterialRequest,
  setRequestStatus,
} from "@/server/services/materials";

const KEY = "VERIFY-P0-ITEM";

/** Fixtures this run created — cleanup removes exactly these, never pre-existing rows. */
const created: { requestIds: string[]; teamAssignment?: { orderId: string; userId: string } } = { requestIds: [] };

async function cleanup() {
  await prisma.materialRequest.deleteMany({
    where: { OR: [{ requestedById: "verify-p0-req" }, { id: { in: created.requestIds } }] }, // legacy tag + this run
  });
  // Only drop the team assignment if WE added it — the employee may legitimately be on this project.
  if (created.teamAssignment) {
    await prisma.teamAssignment.deleteMany({ where: created.teamAssignment });
    created.teamAssignment = undefined;
  }
  created.requestIds = [];
  await prisma.item.deleteMany({ where: { name: KEY } });
}

async function expectThrow(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  await cleanup();
  const fixtureItem = await prisma.item.create({
    data: { companyId: A.companyId, name: KEY, category: "VerifyCat", unit: "nos", reorderLevel: "5.000", purchasePrice: "999.00" },
  });

  // 1 — pagination shape + cap + cursor.
  const p1 = await listItems(A, { take: 1 });
  check("listItems returns {items,nextCursor}", Array.isArray(p1.items) && "nextCursor" in p1);
  check("take capped (page ≤ 1)", p1.items.length <= 1);
  if (p1.nextCursor) {
    const p2 = await listItems(A, { take: 1, cursor: p1.nextCursor });
    check("cursor advances (no overlap)", !p2.items.some((i) => i.id === p1.items[0]?.id));
  } else check("cursor advances (single page — skipped)", true);

  // 2 — search + category filter find the fixture.
  const searched = await listItems(A, { search: KEY, take: 100 });
  check("search finds the fixture", searched.items.some((i) => i.id === fixtureItem.id));
  const filtered = await listItems(A, { category: "VerifyCat", take: 100 });
  check("category filter finds the fixture", filtered.items.some((i) => i.id === fixtureItem.id));
  check("category filter excludes other categories", filtered.items.every((i) => i.category === "VerifyCat"));
  check("materialCategories includes the fixture category", (await materialCategories(A)).includes("VerifyCat"));

  // 3 — CRITICAL RBAC: purchasePrice present for ADMIN, stripped for EMPLOYEE.
  const adminRow = searched.items.find((i) => i.id === fixtureItem.id)!;
  check("purchasePrice present for ADMIN", "purchasePrice" in adminRow);
  const empSearched = await listItems(E, { search: KEY, take: 100 });
  check("purchasePrice STRIPPED for EMPLOYEE (no leak)", !JSON.stringify(empSearched.items).includes("purchasePrice"));

  // 4 — materialsStats vs raw DB + RBAC on stockValue.
  const s = await materialsStats(A);
  const rawItems = await prisma.item.count({ where: { companyId: A.companyId } });
  const rawOpenPOs = await prisma.purchaseOrder.count({ where: { companyId: A.companyId, status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } } });
  check(`stats.totalItems matches DB (${s.totalItems}==${rawItems})`, s.totalItems === rawItems);
  check(`stats.openPOs matches DB (${s.openPOs}==${rawOpenPOs})`, s.openPOs === rawOpenPOs);
  check("stats.lowStockCount ≥ 0", s.lowStockCount >= 0);
  check("stats.stockValue is a number for ADMIN", typeof s.stockValue === "number");
  const empStats = await materialsStats(E);
  check("stats.stockValue is null for EMPLOYEE", empStats.stockValue === null);

  // 5 — MaterialRequest lifecycle: the dead statuses are now reachable + audited.
  const order = await prisma.order.findFirst({ where: { companyId: A.companyId } });
  if (!order) throw new Error("need an order for the request fixture");

  // The request is the ONE materials flow open to EMPLOYEE (it carries no prices), so raise it
  // as the real employee — which is only allowed on a project they're actually on. An unassigned
  // employee must be refused (createMaterialRequest now tenant-checks the orderId + requires
  // project access; the caller-supplied orderId was previously trusted outright).
  check(
    "EMPLOYEE off the team cannot raise a request for that project",
    await expectThrow(() => createMaterialRequest(E, order.id, [{ itemId: fixtureItem.id, qty: 1 }])),
  );
  const preExisting = await prisma.teamAssignment.findUnique({
    where: { orderId_userId: { orderId: order.id, userId: emp.id } },
  });
  if (!preExisting) {
    await prisma.teamAssignment.create({ data: { orderId: order.id, userId: emp.id, role: "Field" } });
    created.teamAssignment = { orderId: order.id, userId: emp.id };
  }
  const req = await createMaterialRequest(E, order.id, [{ itemId: fixtureItem.id, qty: 2 }]);
  created.requestIds.push(req.id);
  check("assigned EMPLOYEE CAN raise a material request (was unreachable in the UI)", !!req.id);
  const createAudit = await prisma.auditLog.findFirst({ where: { entity: "MaterialRequest", entityId: req.id, action: "CREATE" } });
  check("createMaterialRequest is audited (was unaudited)", !!createAudit);
  await setRequestStatus(A, req.id, "TRANSFERRED");
  check("request → TRANSFERRED persists (dead status now reachable)", (await prisma.materialRequest.findUnique({ where: { id: req.id } }))?.status === "TRANSFERRED");
  await setRequestStatus(A, req.id, "CONVERTED_PO");
  check("request → CONVERTED_PO persists", (await prisma.materialRequest.findUnique({ where: { id: req.id } }))?.status === "CONVERTED_PO");
  await setRequestStatus(A, req.id, "REJECTED");
  check("request → REJECTED persists", (await prisma.materialRequest.findUnique({ where: { id: req.id } }))?.status === "REJECTED");
  const statusAudit = await prisma.auditLog.findFirst({ where: { entity: "MaterialRequest", entityId: req.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  check("status change audited", !!statusAudit);
  check("EMPLOYEE blocked from setRequestStatus", await expectThrow(() => setRequestStatus(E, req.id, "PENDING")));

  await cleanup();
  console.log(`\n✅ Materials/Inventory P0 verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
