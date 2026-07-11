/**
 * Verifies Dashboard/Reports P0 — the RBAC money gate (employee gets no revenue/
 * topClients — the non-negotiable), that the bounded scans still produce correct
 * numbers (revenue == Σ receipts; recent/top capped at 4), and reports admin-only.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { getRichDashboard } from "@/server/services/dashboard-rich";
import { getReceivables } from "@/server/services/reports";

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

  const d = await getRichDashboard(A);
  const e = await getRichDashboard(E);

  // 1 — RBAC money gate (the non-negotiable).
  check("ADMIN dashboard has revenue", d.revenue !== null);
  check("ADMIN dashboard has topClients", Array.isArray(d.topClients) && d.topClients.length >= 0);
  check("EMPLOYEE revenue is null (no leak)", e.revenue === null);
  check("EMPLOYEE revenueSeries is empty", e.revenueSeries.length === 0);
  check("EMPLOYEE topClients is empty", e.topClients.length === 0);
  const ej = JSON.stringify(e);
  check("EMPLOYEE payload leaks no revenue value", !/"revenue":"?\d/.test(ej));

  // 2 — bounded scans still correct: revenue == Σ all receipts (aggregate path).
  const rawReceipts = await prisma.receipt.aggregate({ where: { milestone: { order: { companyId: A.companyId } } }, _sum: { amount: true } });
  const rawTotal = new Decimal(rawReceipts._sum.amount ?? 0);
  check(`ADMIN revenue == Σ receipts (${d.revenue}==${rawTotal.toFixed(2)})`, new Decimal(d.revenue!).equals(rawTotal));

  // 3 — bounded lists capped at 4 (were full-table slices).
  check("recentProjects capped at 4", d.recentProjects.length <= 4);
  check("topClients capped at 4", d.topClients.length <= 4);
  check("revenueSeries is 7 monthly buckets", d.revenueSeries.length === 7);

  // 4 — health totals reconcile with the active-project count.
  check("health buckets sum to active total", d.health.healthy + d.health.warning + d.health.critical === d.health.total);

  // 5 — reports is admin-only.
  check("getReceivables works for ADMIN", Array.isArray((await getReceivables(A)).rows));
  check("EMPLOYEE blocked from getReceivables (requireAdmin)", await expectThrow(() => getReceivables(E)));

  console.log(`\n✅ Dashboard/Reports P0 verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
