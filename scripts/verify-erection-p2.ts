/**
 * Verifies Erection P2 — the stripPricing defense-in-depth net on budgetVsActual /
 * closeoutData. requireAdmin gates them, so the net is a no-op for the admin caller
 * (full object); we also prove the net's EFFECT: applying stripPricing with a
 * non-admin role drops the ADMIN_ONLY keys (budget/committed/grossMargin).
 */
import { prisma } from "@/lib/prisma";
import { stripPricing } from "@/lib/rbac";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { budgetVsActual, closeoutData } from "@/server/services/erection";

async function expectThrow(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  const order = await prisma.order.findFirst({ where: { companyId: A.companyId, budget: { isNot: null } } });
  if (!order) throw new Error("need a budgeted order");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  // 1 — admin sees the full BvA (net is a no-op for admin).
  const bva = await budgetVsActual(A, order.id);
  check("ADMIN budgetVsActual keeps budget", "budget" in bva);
  check("ADMIN budgetVsActual keeps committed", "committed" in bva);
  check("ADMIN keeps non-admin fields (spent/pctConsumed)", "spent" in bva && "pctConsumed" in bva);

  // 2 — the net's EFFECT: if a non-admin reached this shape, ADMIN_ONLY keys drop.
  const stripped = stripPricing(bva, "EMPLOYEE") as Record<string, unknown>;
  check("stripPricing drops budget for non-admin (net works)", !("budget" in stripped));
  check("stripPricing drops committed for non-admin", !("committed" in stripped));
  check("stripPricing keeps spent (sell-side, not admin-only)", "spent" in stripped);

  // 3 — closeoutData: admin keeps grossMargin; the net would strip it + budget.
  const closeout = await closeoutData(A, order.id);
  check("ADMIN closeoutData keeps grossMargin", "grossMargin" in closeout);
  const strippedClose = stripPricing(closeout, "EMPLOYEE") as Record<string, unknown>;
  check("stripPricing drops grossMargin for non-admin", !("grossMargin" in strippedClose));
  check("stripPricing drops budget in closeout for non-admin", !("budget" in strippedClose));

  // 4 — requireAdmin still hard-blocks employees at the door (belt AND suspenders).
  check("EMPLOYEE blocked from budgetVsActual (requireAdmin)", await expectThrow(() => budgetVsActual(E, order.id)));
  check("EMPLOYEE blocked from closeoutData (requireAdmin)", await expectThrow(() => closeoutData(E, order.id)));

  console.log(`\n✅ Erection P2 (stripPricing net) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
