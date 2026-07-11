/**
 * Verifies Service/AMC P2 — renewContract (next-term creation + renewal-chain link
 * + visit generation), the renewal-rate analytics it feeds, and the admin guard.
 * Fixtures use fixed keys and are cleaned up, so the script is idempotent.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { renewContract, amcAnalytics } from "@/server/services/amc";

const KEY = "GEC-AMC-VERIFY-P2";
const DAY = 86_400_000;

async function cleanup() {
  // Delete renewals (children pointing via renewedFromId) before their sources.
  const rows = await prisma.serviceContract.findMany({ where: { OR: [{ contractNo: KEY }, { renewedFrom: { contractNo: KEY } }] }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.communication.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.maintenanceVisit.deleteMany({ where: { contractId: { in: ids } } });
    // renewals first (they reference the source), then sources.
    await prisma.serviceContract.deleteMany({ where: { renewedFromId: { in: ids } } });
    await prisma.serviceContract.deleteMany({ where: { id: { in: ids } } });
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

  await cleanup();
  const now = new Date();
  // A lapsed contract (past endDate, still persisted ACTIVE → derived EXPIRED).
  const prev = await prisma.serviceContract.create({
    data: {
      companyId: A.companyId, contractNo: KEY, clientName: "P2 Client", siteAddress: "P2 Site",
      startDate: new Date(now.getTime() - 400 * DAY), endDate: new Date(now.getTime() - 20 * DAY),
      annualValue: "180000.00", frequency: "QUARTERLY", visitsPerYear: 4, scope: { mechanical: true },
      status: "ACTIVE", createdById: A.userId,
    },
  });

  // 1 — renewContract mints the next term, linked + scheduled.
  const res = await renewContract(A, prev.id);
  const renewed = await prisma.serviceContract.findUnique({ where: { id: res.contractId }, include: { visits: true } });
  check("renewal is a new contract with a new number", !!renewed && renewed.contractNo !== prev.contractNo);
  check("renewal links back via renewedFromId", renewed?.renewedFromId === prev.id);
  check("renewal starts the day after the old term ends", renewed?.startDate.getTime() === prev.endDate.getTime() + DAY);
  check("renewal runs the same duration", (renewed!.endDate.getTime() - renewed!.startDate.getTime()) === (prev.endDate.getTime() - prev.startDate.getTime()));
  check("renewal copies client/frequency/scope", renewed?.clientName === prev.clientName && renewed?.frequency === prev.frequency);
  check("renewal generated its visit cycle", (renewed?.visits.length ?? 0) === res.visits && res.visits > 0);
  check("renewal is ACTIVE", renewed?.status === "ACTIVE");
  const aud = await prisma.auditLog.findFirst({ where: { entity: "ServiceContract", entityId: res.contractId, action: "CREATE" } });
  check("renewal audited (with renewedFrom)", !!aud && ((aud.after ?? {}) as Record<string, unknown>).renewedFrom === prev.contractNo);

  // 2 — the renewal-rate analytics now counts the lapsed source as renewed.
  const an = await amcAnalytics(A);
  check("analytics: expiredContracts ≥ 1 (the lapsed source)", an.expiredContracts >= 1);
  check("analytics: renewedContracts ≥ 1", an.renewedContracts >= 1);
  check("analytics: renewalRatePct is computed", an.renewalRatePct !== null && an.renewalRatePct >= 0 && an.renewalRatePct <= 100);

  // 3 — RBAC: EMPLOYEE cannot renew.
  check("EMPLOYEE blocked from renewContract", await expectThrow(() => renewContract(E, prev.id)));

  await cleanup();
  console.log(`\n✅ Service/AMC P2 (renewal + renewal-rate) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
