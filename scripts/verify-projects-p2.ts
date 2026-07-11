/** Verifies projectAnalytics aggregation vs raw DB. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { projectAnalytics } from "@/server/services/order";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const a = await projectAnalytics(A);
  const rawTotal = await prisma.order.count({ where: { companyId: A.companyId, deletedAt: null } });
  const rawActive = await prisma.order.count({ where: { companyId: A.companyId, deletedAt: null, status: "ACTIVE" } });
  const rawCompleted = await prisma.order.count({ where: { companyId: A.companyId, deletedAt: null, status: "COMPLETED" } });
  check(`total matches DB (${a.total}==${rawTotal})`, a.total === rawTotal);
  check(`active matches DB (${a.active}==${rawActive})`, a.active === rawActive);
  check(`completed matches DB (${a.completed}==${rawCompleted})`, a.completed === rawCompleted);
  check("funnel sums to total", a.funnel.reduce((s, f) => s + f.count, 0) === a.total);
  const rawDone = await prisma.stage.count({ where: { status: "DONE", order: { companyId: A.companyId, deletedAt: null } } });
  check(`doneStages matches DB (${a.doneStages}==${rawDone})`, a.doneStages === rawDone);
  check("value-in-execution + receivables non-negative", a.valueInExecution >= 0 && a.receivablesOutstanding >= 0);
  check("avgProgress in [0,100] or null", a.avgProgressPct === null || (a.avgProgressPct >= 0 && a.avgProgressPct <= 100));
  check("overdue receivables <= outstanding", a.receivablesOverdue <= a.receivablesOutstanding);

  console.log(`\n✅ Project analytics verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
