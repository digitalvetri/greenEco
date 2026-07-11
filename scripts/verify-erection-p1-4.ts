/** Verifies erectionAnalytics aggregation vs raw DB, coherence with erectionStats, and admin-only RBAC. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { erectionAnalytics, erectionStats } from "@/server/services/erection";

const LKEY = "VERIFY-P14-LOC";

async function cleanup() {
  const loc = await prisma.location.findFirst({ where: { name: LKEY } });
  if (loc) {
    await prisma.stockMovement.deleteMany({ where: { fromLocationId: loc.id } });
    await prisma.location.delete({ where: { id: loc.id } });
  }
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

  // Discriminating fixture: a CONSUME on a site NOT tied to an active-budgeted order.
  // Company-wide consumption must include it (the old active-only scope would drop it).
  await cleanup();
  const item = await prisma.item.findFirst({ where: { companyId: A.companyId } });
  if (item) {
    const loc = await prisma.location.create({ data: { companyId: A.companyId, type: "SITE", name: LKEY } });
    await prisma.stockMovement.create({ data: { companyId: A.companyId, itemId: item.id, qty: "1.000", type: "CONSUME", fromLocationId: loc.id, valueAtCost: "555.00", createdById: A.userId } });
  }

  const a = await erectionAnalytics(A);

  // Consumption is summed company-wide: equals Σ of ALL company CONSUME valueAtCost.
  const rawConsume = await prisma.stockMovement.aggregate({ where: { companyId: A.companyId, type: "CONSUME", valueAtCost: { not: null } }, _sum: { valueAtCost: true } });
  const rawConsumeTotal = Math.round(Number(rawConsume._sum.valueAtCost ?? 0));
  const analyticsConsume = a.spendByType.find((t) => t.type === "Consumption")?.value ?? -1;
  check(`Consumption is company-wide (${analyticsConsume}==${rawConsumeTotal}, incl. the off-active-site ₹555)`, analyticsConsume === rawConsumeTotal && (item ? analyticsConsume >= 555 : true));
  await cleanup();

  const a2 = await erectionAnalytics(A);

  const rawEntries = await prisma.erectionEntry.count({ where: { order: { companyId: A.companyId } } });
  check(`totalEntries matches DB (${a2.totalEntries}==${rawEntries})`, a2.totalEntries === rawEntries);
  check("byStatus sums to totalEntries", a2.byStatus.reduce((s, x) => s + x.count, 0) === a2.totalEntries);
  check("approvalRatePct in [0,100] or null", a2.approvalRatePct === null || (a2.approvalRatePct >= 0 && a2.approvalRatePct <= 100));

  // spendByType sums to totalSpend (the tile ↔ chart coherence).
  check("spendByType sums to totalSpend", a2.spendByType.reduce((s, t) => s + t.value, 0) === a2.totalSpend);
  check("totalSpend ≥ 0", a2.totalSpend >= 0);

  // Approved erection spend (labour+sitePurchase+other) matches raw approved sum.
  const approvedAgg = await prisma.erectionEntry.aggregate({ where: { order: { companyId: A.companyId }, status: "APPROVED" }, _sum: { amount: true } });
  const rawApprovedErection = Math.round(Number(approvedAgg._sum.amount ?? 0));
  const analyticsErection = a2.spendByType.filter((t) => t.type !== "Consumption").reduce((s, t) => s + t.value, 0);
  check(`approved erection spend matches DB (${analyticsErection}≈${rawApprovedErection})`, Math.abs(analyticsErection - rawApprovedErection) <= 3);

  // budgetBurn covers active budgeted orders; overrunCount is coherent with erectionStats.
  const rawActiveBudgeted = await prisma.order.count({ where: { companyId: A.companyId, status: "ACTIVE", budget: { isNot: null } } });
  check(`budgetBurn covers active budgeted orders (${a2.budgetBurn.length}==${rawActiveBudgeted})`, a2.budgetBurn.length === rawActiveBudgeted);
  check("budgetBurn is sorted by pctConsumed desc", a2.budgetBurn.every((b, i) => i === 0 || a2.budgetBurn[i - 1].pctConsumed >= b.pctConsumed));
  check("overrunCount = budgetBurn rows flagged overrun", a2.overrunCount === a2.budgetBurn.filter((b) => b.overrun).length);
  const stats = await erectionStats(A);
  check(`overrunCount matches erectionStats.overrunProjects (${a2.overrunCount}==${stats.overrunProjects})`, a2.overrunCount === stats.overrunProjects);

  // RBAC — the whole analytics is admin-only.
  check("EMPLOYEE blocked from erectionAnalytics (admin-only)", await expectThrow(() => erectionAnalytics(E)));

  console.log(`\n✅ Erection P1-4 (analytics) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
