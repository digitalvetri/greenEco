/** Verifies leadAnalytics aggregation vs raw DB counts + RBAC scope. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { leadAnalytics } from "@/server/services/lead";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const a = await leadAnalytics(A);
  // cross-check totals vs raw DB (admin = all non-deleted)
  const rawTotal = await prisma.lead.count({ where: { companyId: A.companyId, deletedAt: null } });
  const rawWon = await prisma.lead.count({ where: { companyId: A.companyId, deletedAt: null, status: "CONVERTED" } });
  const rawLost = await prisma.lead.count({ where: { companyId: A.companyId, deletedAt: null, status: "LOST" } });
  check(`total matches DB (${a.total} == ${rawTotal})`, a.total === rawTotal);
  check(`won matches DB (${a.won} == ${rawWon})`, a.won === rawWon);
  check(`lost matches DB (${a.lost} == ${rawLost})`, a.lost === rawLost);
  check("funnel counts sum to total", a.funnel.reduce((s, f) => s + f.count, 0) === a.total);
  check("winRate = won/(won+lost)", a.winRatePct === (rawWon + rawLost > 0 ? Math.round((rawWon / (rawWon + rawLost)) * 100) : null));
  check("temperature sums to open", a.temperature.HOT + a.temperature.WARM + a.temperature.COLD === a.open);
  check("bySource counts sum to total", a.bySource.reduce((s, x) => s + x.count, 0) === a.total);
  check("lostByReason counts sum to lost", a.lostByReason.reduce((s, x) => s + x.count, 0) === a.lost);
  check("open pipeline value is non-negative", a.openPipelineValue >= 0);

  // RBAC: employee scope is a subset
  const e = await leadAnalytics(E);
  const empTotal = await prisma.lead.count({ where: { companyId: E.companyId, deletedAt: null, OR: [{ assignedToId: E.userId }, { createdById: E.userId }] } });
  check(`employee total is RBAC-scoped (${e.total} == ${empTotal})`, e.total === empTotal);
  check("employee sees <= admin total", e.total <= a.total);

  console.log(`\n✅ Lead analytics verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
