/** Verifies amcAnalytics aggregation vs raw DB + RBAC on recurring revenue. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { amcAnalytics } from "@/server/services/amc";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const a = await amcAnalytics(A);
  const now = new Date();

  const rawTotal = await prisma.serviceContract.count({ where: { companyId: A.companyId } });
  check(`totalContracts matches DB (${a.totalContracts}==${rawTotal})`, a.totalContracts === rawTotal);
  check("funnel sums to total", a.funnel.reduce((s, f) => s + f.count, 0) === a.totalContracts);

  const rawActive = await prisma.serviceContract.count({
    where: { companyId: A.companyId, status: { notIn: ["CANCELLED", "DRAFT"] }, endDate: { gte: now } },
  });
  check(`active matches DB (${a.active}==${rawActive})`, a.active === rawActive);
  check("byFrequency sums to active", a.byFrequency.reduce((s, f) => s + f.count, 0) === a.active);

  const rawVisitsDone = await prisma.maintenanceVisit.count({ where: { contract: { companyId: A.companyId }, actualDate: { not: null } } });
  check(`visitsDone matches DB (${a.visitsDone}==${rawVisitsDone})`, a.visitsDone === rawVisitsDone);
  check("visitCompliance in [0,100] or null", a.visitCompliancePct === null || (a.visitCompliancePct >= 0 && a.visitCompliancePct <= 100));

  const rawTickets = await prisma.serviceTicket.count({ where: { companyId: A.companyId } });
  check(`ticketsTotal matches DB (${a.ticketsTotal}==${rawTickets})`, a.ticketsTotal === rawTickets);
  check("slaBreachPct in [0,100] or null", a.slaBreachPct === null || (a.slaBreachPct >= 0 && a.slaBreachPct <= 100));
  check("ticketsBreached ≤ ticketsTotal", a.ticketsBreached <= a.ticketsTotal);

  // Recurring revenue: admin sees the Σ; the raw sum matches; employee gets null.
  const activeRows = await prisma.serviceContract.findMany({
    where: { companyId: A.companyId, status: { notIn: ["CANCELLED", "DRAFT"] }, endDate: { gte: now } },
    select: { annualValue: true },
  });
  const rawRevenue = Math.round(activeRows.reduce((s, c) => s + Number(c.annualValue), 0));
  check(`recurringRevenue matches DB (${a.recurringRevenue}==${rawRevenue})`, a.recurringRevenue === rawRevenue);
  const empA = await amcAnalytics(E);
  check("recurringRevenue is null for EMPLOYEE", empA.recurringRevenue === null);
  check("EMPLOYEE still gets non-money analytics", empA.totalContracts === a.totalContracts && empA.active === a.active);

  console.log(`\n✅ Service/AMC P1-4 (analytics) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
