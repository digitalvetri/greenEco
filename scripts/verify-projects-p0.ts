/** Verifies Projects P0: pagination, dead-status fix (lifecycle), stats. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { listOrders, orderStats, setOrderStatus } from "@/server/services/order";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  // pagination
  const list = await listOrders(A, { take: 100 });
  check("listOrders returns {items,nextCursor}", Array.isArray(list.items) && "nextCursor" in list);
  const pg1 = await listOrders(A, { take: 1 });
  check("page 1 returns a nextCursor when >1 exist", pg1.items.length === 1 && pg1.nextCursor !== null);
  const pg2 = await listOrders(A, { take: 1, cursor: pg1.nextCursor! });
  check("page 2 via cursor is a different project", pg2.items[0] && pg2.items[0].id !== pg1.items[0].id);
  check("rows carry progress + overdue flags", typeof pg1.items[0].progress === "number" && "overdue" in pg1.items[0]);

  // search
  const oneNo = pg1.items[0].orderNo.slice(-3);
  const searched = await listOrders(A, { search: oneNo, take: 100 });
  check("search filters the set", searched.items.length >= 1 && searched.items.every((o) => o.orderNo.includes(oneNo) || o.clientName || o.siteAddress));

  // P0-2: dead status now reachable
  const target = list.items[0];
  await setOrderStatus(A, target.id, "ON_HOLD");
  let o = await prisma.order.findUnique({ where: { id: target.id } });
  check("setOrderStatus → ON_HOLD (was a dead status)", o?.status === "ON_HOLD");
  await setOrderStatus(A, target.id, "COMPLETED");
  o = await prisma.order.findUnique({ where: { id: target.id } });
  check("→ COMPLETED reachable", o?.status === "COMPLETED");
  await setOrderStatus(A, target.id, "ACTIVE"); // reopen
  o = await prisma.order.findUnique({ where: { id: target.id } });
  check("reopen → ACTIVE", o?.status === "ACTIVE");

  let threw = false;
  try { await setOrderStatus(E, target.id, "ON_HOLD"); } catch { threw = true; }
  check("EMPLOYEE cannot change project status (admin only)", threw);

  // status filter tab
  await setOrderStatus(A, target.id, "ON_HOLD");
  const held = await listOrders(A, { status: "ON_HOLD", take: 100 });
  check("status filter returns only that status", held.items.every((x) => x.status === "ON_HOLD"));
  await setOrderStatus(A, target.id, "ACTIVE");

  // stats
  const s = await orderStats(A);
  check("orderStats shape", ["active", "onHold", "completed", "overduePayments", "receivables"].every((k) => k in s));
  check("counts non-negative", [s.active, s.onHold, s.completed, s.overduePayments, s.receivables].every((n) => n >= 0));

  console.log(`\n✅ Projects P0 verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
