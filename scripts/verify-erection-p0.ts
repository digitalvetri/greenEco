/**
 * Verifies Erection P0 — entry-list pagination + search + type/status filter,
 * erectionStats vs raw DB (+ RBAC on the money aggregates), the reviewEntry
 * terminal-state guard, the SITE_PURCHASE bill gate, creator-scoping, and the
 * newly-audited acknowledgeOverrun. Fixtures use a marker + are cleaned up.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  createErectionEntry,
  listEntries,
  reviewEntry,
  erectionStats,
  budgetVsActual,
  acknowledgeOverrun,
} from "@/server/services/erection";

const MARK = "VERIFY-P0-ERECTION";

async function cleanup() {
  await prisma.erectionEntry.deleteMany({ where: { description: { startsWith: MARK } } });
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
  // An order with a budget that the employee is also assigned to.
  const order = await prisma.order.findFirst({ where: { companyId: A.companyId, budget: { isNot: null }, team: { some: { userId: emp.id } } }, include: { budget: true } });
  if (!order || !order.budget) throw new Error("need a budgeted order with the dev-employee assigned");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  await cleanup();

  // 1 — bill gate: SITE_PURCHASE without a bill is rejected.
  check("SITE_PURCHASE without a bill is blocked", await expectThrow(() => createErectionEntry(A, { orderId: order.id, type: "SITE_PURCHASE", date: new Date(), description: `${MARK} nobill`, amount: 100, billImages: [] })));

  // 2 — create a LABOUR entry (admin) → PENDING; approve; terminal guard blocks re-review.
  const e1 = await createErectionEntry(A, { orderId: order.id, type: "LABOUR", date: new Date(), description: `${MARK} labour`, amount: 5000, billImages: [] });
  check("new entry is PENDING", e1.status === "PENDING");
  await reviewEntry(A, e1.id, "APPROVE", "ok");
  check("reviewEntry approves", (await prisma.erectionEntry.findUnique({ where: { id: e1.id } }))?.status === "APPROVED");
  const revAudit = await prisma.auditLog.findFirst({ where: { entity: "ErectionEntry", entityId: e1.id, action: "APPROVE" }, orderBy: { createdAt: "desc" } });
  check("review audited (before/after status)", !!revAudit);
  check("terminal-state guard blocks re-reviewing an APPROVED entry", await expectThrow(() => reviewEntry(A, e1.id, "REJECT")));

  // 3 — employee creates their own entry; creator-scoping.
  const e2 = await createErectionEntry(E, { orderId: order.id, type: "OTHER", date: new Date(), description: `${MARK} emp`, amount: 300, billImages: [] });
  const empList = await listEntries(E, { take: 100 });
  check("employee sees their own entry", empList.items.some((x) => x.id === e2.id));
  check("employee does NOT see the admin's entry (creator-scoped)", !empList.items.some((x) => x.id === e1.id));
  check("employee blocked from reviewEntry", await expectThrow(() => reviewEntry(E, e2.id, "APPROVE")));

  // 4 — pagination + filters (admin).
  const p1 = await listEntries(A, { take: 1 });
  check("listEntries returns {items,nextCursor}", Array.isArray(p1.items) && "nextCursor" in p1);
  check("take capped (page ≤ 1)", p1.items.length <= 1);
  if (p1.nextCursor) {
    const p2 = await listEntries(A, { take: 1, cursor: p1.nextCursor });
    check("cursor advances (no overlap)", !p2.items.some((x) => x.id === p1.items[0]?.id));
  } else check("cursor advances (skipped)", true);
  const approvedList = await listEntries(A, { status: "APPROVED", take: 100 });
  check("status filter returns only APPROVED", approvedList.items.every((x) => x.status === "APPROVED") && approvedList.items.some((x) => x.id === e1.id));
  const labourList = await listEntries(A, { type: "LABOUR", search: MARK, take: 100 });
  check("type + search filter finds the labour fixture", labourList.items.some((x) => x.id === e1.id) && labourList.items.every((x) => x.type === "LABOUR"));

  // 5 — erectionStats vs raw DB + RBAC.
  const s = await erectionStats(A);
  const rawPending = await prisma.erectionEntry.count({ where: { order: { companyId: A.companyId }, status: "PENDING" } });
  check(`stats.pendingReview matches DB (${s.pendingReview}==${rawPending})`, s.pendingReview === rawPending);
  check("stats.approvedSpend is a number for ADMIN", typeof s.approvedSpend === "number");
  check("stats.overrunProjects is a number for ADMIN", typeof s.overrunProjects === "number");
  // Coherence: the overrun tile must match what the BvA cards show (pctConsumed ≥ 100).
  // Compare against the EXACT spent+committed≥budget (not the rounded pctConsumed, which
  // could false-fail at the 99.5–99.99% boundary) — this is the definition erectionStats uses.
  const { Decimal: Dec } = await import("decimal.js");
  const activeBudgeted = await prisma.order.findMany({ where: { companyId: A.companyId, status: "ACTIVE", budget: { isNot: null } }, select: { id: true } });
  let cardOverruns = 0;
  for (const o of activeBudgeted) {
    const bva = await budgetVsActual(A, o.id);
    if (new Dec(bva.spent).plus(bva.committed).gte(new Dec(bva.budget))) cardOverruns += 1;
  }
  check(`overrunProjects matches the BvA cards (${s.overrunProjects}==${cardOverruns})`, s.overrunProjects === cardOverruns);
  const es = await erectionStats(E);
  check("stats.approvedSpend is null for EMPLOYEE", es.approvedSpend === null);
  check("stats.overrunProjects is null for EMPLOYEE", es.overrunProjects === null);
  check("EMPLOYEE pendingReview counts only own", es.pendingReview === await prisma.erectionEntry.count({ where: { order: { companyId: A.companyId }, createdById: emp.id, status: "PENDING" } }));

  // 6 — acknowledgeOverrun is now audited (was unaudited); restore adjustments after.
  const before = order.budget.adjustments;
  await acknowledgeOverrun(A, order.id, `${MARK} ack`);
  const ackAudit = await prisma.auditLog.findFirst({ where: { entity: "Budget", entityId: order.budget.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  check("acknowledgeOverrun is audited", !!ackAudit);
  await prisma.budget.update({ where: { id: order.budget.id }, data: { adjustments: before as object } }); // restore

  await cleanup();
  console.log(`\n✅ Erection P0 verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
