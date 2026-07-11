/**
 * Verifies Erection P1 — the approval-activity timeline (erectionActivity), the
 * QUERIED dead-end fix (needsReview surfaces PENDING+QUERIED so a queried entry is
 * re-reviewable), and requireProjectAccess on the timeline. Fixtures use a marker.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  createErectionEntry,
  reviewEntry,
  listEntries,
  erectionActivity,
} from "@/server/services/erection";

const MARK = "VERIFY-P1-ERECTION";

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
  const order = await prisma.order.findFirst({ where: { companyId: A.companyId, team: { some: { userId: emp.id } } } });
  const unassigned = await prisma.order.findFirst({ where: { companyId: A.companyId, team: { none: { userId: emp.id } } } });
  if (!order) throw new Error("need an order the dev-employee is assigned to");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  await cleanup();

  // 1 — QUERIED dead-end fix: an entry queried by admin stays in the review queue.
  const e1 = await createErectionEntry(A, { orderId: order.id, type: "LABOUR", date: new Date(), description: `${MARK} labour`, amount: 4000, billImages: [] });
  await reviewEntry(A, e1.id, "QUERY", "need the muster roll");
  check("entry is QUERIED", (await prisma.erectionEntry.findUnique({ where: { id: e1.id } }))?.status === "QUERIED");
  const queue = await listEntries(A, { needsReview: true, take: 200 });
  check("QUERIED entry appears in the needs-review queue (dead-end fixed)", queue.items.some((x) => x.id === e1.id));
  check("needs-review queue excludes APPROVED/REJECTED", queue.items.every((x) => x.status === "PENDING" || x.status === "QUERIED"));

  // 2 — a QUERIED entry can be resolved (approved) — the guard permits it.
  await reviewEntry(A, e1.id, "APPROVE", "roll received");
  check("QUERIED → APPROVED resolves", (await prisma.erectionEntry.findUnique({ where: { id: e1.id } }))?.status === "APPROVED");

  // 3 — approval-activity timeline merges created + review events, newest-first.
  const acts = (await erectionActivity(A, order.id))!;
  check("timeline returns events", acts.length > 0);
  check("timeline has a 'created' event for the entry", acts.some((e) => e.kind === "created" && e.detail?.includes(MARK)));
  check("timeline has 'review' events (queried + approved)", acts.filter((e) => e.kind === "review").length >= 2);
  const sorted = acts.every((e, i) => i === 0 || new Date(acts[i - 1].at).getTime() >= new Date(e.at).getTime());
  check("timeline is newest-first", sorted);
  check("created event carries the entry amount", acts.some((e) => e.kind === "created" && e.amount === "4000"));

  // 4 — the timeline is a cross-author cost view → ADMIN ONLY (even an ASSIGNED
  // employee is blocked, because it surfaces teammates' amounts). This is the RBAC
  // decision: the entries CARD is creator-scoped, so the timeline must not leak wider.
  check("employee BLOCKED from erectionActivity (admin-only, even when assigned)", await expectThrow(() => erectionActivity(E, order.id)));

  // 4b — discriminating: the admin timeline IS cross-author — it includes an entry
  // authored by a DIFFERENT user (amount 777), which is exactly why it can't be shown
  // to a creator-scoped employee. (Insert directly to guarantee a second author.)
  await prisma.erectionEntry.create({ data: { orderId: order.id, type: "OTHER", date: new Date(), description: `${MARK} other-author`, amount: "777.00", billImages: [], status: "PENDING", createdById: "verify-p1-other" } });
  const adminActs = (await erectionActivity(A, order.id))!;
  check("admin timeline includes a second author's entry (cross-author → admin-only)", adminActs.some((e) => e.kind === "created" && e.amount === "777"));
  void unassigned;

  await cleanup();
  console.log(`\n✅ Erection P1 (timeline + QUERIED fix) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
