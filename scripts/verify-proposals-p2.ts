/** Verifies proposalAnalytics aggregation vs raw DB counts. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { proposalAnalytics } from "@/server/services/proposal";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const a = await proposalAnalytics(A);
  const rawTotal = await prisma.proposal.count({ where: { companyId: A.companyId } });
  const rawWon = await prisma.proposal.count({ where: { companyId: A.companyId, status: "WON" } });
  const rawLost = await prisma.proposal.count({ where: { companyId: A.companyId, status: "LOST" } });
  check(`total matches DB (${a.total}==${rawTotal})`, a.total === rawTotal);
  check(`won matches DB (${a.won}==${rawWon})`, a.won === rawWon);
  check(`lost matches DB (${a.lost}==${rawLost})`, a.lost === rawLost);
  check("funnel sums to total", a.funnel.reduce((s, f) => s + f.count, 0) === a.total);
  check("winRate = won/(won+lost)", a.winRatePct === (rawWon + rawLost > 0 ? Math.round((rawWon / (rawWon + rawLost)) * 100) : null));
  check("byPlantType counts sum to total", a.byPlantType.reduce((s, x) => s + x.count, 0) === a.total);
  check("lostByReason sums to lost", a.lostByReason.reduce((s, x) => s + x.count, 0) === a.lost);
  check("aiVsManual closed sums to won+lost", a.aiVsManual.ai.closed + a.aiVsManual.manual.closed === a.won + a.lost);
  check("avg deal size >= 0 and pipeline >= 0", a.avgDealSize >= 0 && a.openPipelineValue >= 0);
  check("win-rate-by-value present when deals closed", (a.won + a.lost === 0) || a.winRateByValuePct !== null);

  console.log(`\n✅ Proposal analytics verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
