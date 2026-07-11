/** Verifies getOpsKpis reuses the module analytics (coherent) + RBAC money gate. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { getOpsKpis } from "@/server/services/dashboard-rich";
import { orderStats } from "@/server/services/order";
import { materialsStats } from "@/server/services/materials";
import { erectionStats } from "@/server/services/erection";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const ops = await getOpsKpis(A);
  const [os, ms, es] = await Promise.all([orderStats(A), materialsStats(A), erectionStats(A)]);
  check("ops.receivables == orderStats.receivables (reused, coherent)", ops.receivables === os.receivables);
  check("ops.stockValue == materialsStats.stockValue", ops.stockValue === ms.stockValue);
  check("ops.erectionOverruns == erectionStats.overrunProjects", ops.erectionOverruns === es.overrunProjects);
  check("ops.amcRunRate is a number for ADMIN", typeof ops.amcRunRate === "number");

  const eops = await getOpsKpis(E);
  check("EMPLOYEE ops.amcRunRate null (admin-only)", eops.amcRunRate === null);
  check("EMPLOYEE ops.stockValue null", eops.stockValue === null);
  check("EMPLOYEE ops.erectionOverruns null (from erectionStats)", eops.erectionOverruns === null);
  check("EMPLOYEE still gets receivables (sell-side)", typeof eops.receivables === "number");

  console.log(`\n✅ Dashboard P1 (ops KPIs) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
