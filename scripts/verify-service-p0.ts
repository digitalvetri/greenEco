/**
 * Verifies Service/AMC P0 — contract pagination + endDate-aware status filter,
 * ticket pagination, the persisted status state machine (setContractStatus +
 * transitionAmcStatuses), RBAC stripping, and audit. Fixtures are created with a
 * fixed key and cleaned up, so the script is idempotent.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  listContracts,
  listTickets,
  setContractStatus,
  transitionAmcStatuses,
} from "@/server/services/amc";

const KEY = "GEC-AMC-VERIFY-P0";

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

  // ---- fixture: a lapsed ACTIVE contract with an overdue UPCOMING visit (past grace) ----
  await prisma.maintenanceVisit.deleteMany({ where: { contract: { contractNo: KEY } } });
  await prisma.serviceContract.deleteMany({ where: { contractNo: KEY } }); // idempotent
  const past = new Date(Date.now() - 60 * 86_400_000);
  const start = new Date(Date.now() - 400 * 86_400_000);
  const fixture = await prisma.serviceContract.create({
    data: {
      companyId: A.companyId, contractNo: KEY, clientName: "Verify P0 Client", siteAddress: "Verify Site",
      startDate: start, endDate: past, annualValue: "120000.00", frequency: "QUARTERLY", visitsPerYear: 4,
      scope: {}, status: "ACTIVE", createdById: A.userId,
      visits: { create: [{ seq: 1, scheduledDate: past, status: "UPCOMING" }] },
    },
    include: { visits: true },
  });

  // 1 — pagination shape + cap.
  const listed = await listContracts(A, { take: 1 });
  check("listContracts returns {items,nextCursor}", Array.isArray(listed.items) && "nextCursor" in listed);
  check("take is capped (page size ≤ 1)", listed.items.length <= 1);
  if (listed.nextCursor) {
    const p2 = await listContracts(A, { take: 1, cursor: listed.nextCursor });
    check("cursor advances (no overlap)", !p2.items.some((c) => c.id === listed.items[0]?.id));
  } else check("cursor advances (single page — skipped)", true);

  // 2 — endDate-aware status filter vs raw DB. The fixture (ACTIVE row, past endDate) must
  // count as EXPIRED, not ACTIVE, even though its persisted status is still ACTIVE.
  const now = new Date();
  const activeList = await listContracts(A, { status: "ACTIVE", take: 100 });
  const expiredList = await listContracts(A, { status: "EXPIRED", take: 100 });
  check("lapsed ACTIVE row is filtered OUT of ACTIVE", !activeList.items.some((c) => c.id === fixture.id));
  check("lapsed ACTIVE row is filtered INTO EXPIRED", expiredList.items.some((c) => c.id === fixture.id));
  const rawActive = await prisma.serviceContract.count({ where: { companyId: A.companyId, status: { in: ["ACTIVE", "DRAFT"] }, endDate: { gte: now } } });
  check(`ACTIVE filter matches raw DB (${activeList.items.length}==${rawActive})`, activeList.items.length === rawActive);

  // 3 — search.
  const searched = await listContracts(A, { search: "Verify P0", take: 100 });
  check("search finds the fixture by client name", searched.items.some((c) => c.id === fixture.id));

  // 3b — status + search compose (AND, not OR-collision). The fixture is a lapsed ACTIVE
  // row → it must appear under EXPIRED+search but NOT under ACTIVE+search.
  const expSearch = await listContracts(A, { status: "EXPIRED", search: "Verify P0", take: 100 });
  check("EXPIRED + search keeps the expiry constraint (finds lapsed fixture)", expSearch.items.some((c) => c.id === fixture.id));
  const actSearch = await listContracts(A, { status: "ACTIVE", search: "Verify P0", take: 100 });
  check("ACTIVE + search excludes the lapsed fixture (no OR-collision)", !actSearch.items.some((c) => c.id === fixture.id));

  // 4 — RBAC: annualValue present for ADMIN, stripped for EMPLOYEE.
  const adminRow = searched.items.find((c) => c.id === fixture.id)!;
  check("annualValue present for ADMIN", "annualValue" in adminRow);
  const empSearched = await listContracts(E, { search: "Verify P0", take: 100 });
  const empRow = empSearched.items.find((c) => c.id === fixture.id)!;
  check("annualValue STRIPPED for EMPLOYEE", !("annualValue" in empRow));

  // 5 — state machine: transitionAmcStatuses persists EXPIRED + MISSED.
  const t1 = await transitionAmcStatuses(A.companyId, now);
  const flipped = await prisma.serviceContract.findUnique({ where: { id: fixture.id }, include: { visits: true } });
  check("contract persisted ACTIVE → EXPIRED", flipped?.status === "EXPIRED");
  check("overdue visit persisted UPCOMING → MISSED", flipped?.visits[0].status === "MISSED");
  check("transition reports counts", t1.contractsExpired >= 1 && t1.visitsMissed >= 1);
  const t2 = await transitionAmcStatuses(A.companyId, now);
  check("transition is idempotent (0 the second run)", t2.contractsExpired === 0);

  // 6 — setContractStatus: cancel + reactivate, audited, guarded.
  await setContractStatus(A, fixture.id, "CANCELLED");
  const cancelled = await prisma.serviceContract.findUnique({ where: { id: fixture.id } });
  check("setContractStatus cancels", cancelled?.status === "CANCELLED");
  const aud = await prisma.auditLog.findFirst({ where: { entity: "ServiceContract", entityId: fixture.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  check("status change audited", !!aud);
  await setContractStatus(A, fixture.id, "ACTIVE");
  check("setContractStatus reactivates", (await prisma.serviceContract.findUnique({ where: { id: fixture.id } }))?.status === "ACTIVE");
  check("EMPLOYEE blocked from setContractStatus", await expectThrow(() => setContractStatus(E, fixture.id, "CANCELLED")));

  // 7 — tickets pagination shape.
  const tix = await listTickets(A, { take: 1 });
  check("listTickets returns {items,nextCursor}", Array.isArray(tix.items) && "nextCursor" in tix);

  // cleanup.
  await prisma.maintenanceVisit.deleteMany({ where: { contract: { contractNo: KEY } } });
  await prisma.serviceContract.deleteMany({ where: { contractNo: KEY } });

  console.log(`\n✅ Service/AMC P0 verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
