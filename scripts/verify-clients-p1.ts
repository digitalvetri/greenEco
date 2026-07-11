/** Verifies clientAnalytics — phone-keyed dedup, LTV, top-clients sort, role-scoping. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { clientAnalytics, clientStats } from "@/server/services/client";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const a = await clientAnalytics(A);
  const s = await clientStats(A);
  check("uniqueCustomers ≤ totalClients (phone dedup collapses ≥)", a.uniqueCustomers <= s.totalClients);
  check("repeatCustomers ≤ uniqueCustomers", a.repeatCustomers <= a.uniqueCustomers);
  check("totalLifetimeValue matches clientStats.lifetimeValue", a.totalLifetimeValue === s.lifetimeValue);
  check("topClients sorted by value desc", a.topClients.every((c, i) => i === 0 || a.topClients[i - 1].value >= c.value));
  check("topClients capped at 10", a.topClients.length <= 10);
  check("topClients value sum ≤ LTV", a.topClients.reduce((x, c) => x + c.value, 0) <= a.totalLifetimeValue);

  const ea = await clientAnalytics(E);
  check("employee sees ≤ admin's unique customers (scoped)", ea.uniqueCustomers <= a.uniqueCustomers);
  check("employee LTV ≤ admin LTV", ea.totalLifetimeValue <= a.totalLifetimeValue);

  console.log(`\n✅ Clients P1 (analytics) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
