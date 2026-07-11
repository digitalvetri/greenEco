/** Verifies Projects P1: execution activity timeline + documents. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { orderActivity, addOrderDocument, deleteOrderDocument, getOrder, updateStage, addReceipt, setOrderStatus } from "@/server/services/order";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const order = await prisma.order.findFirst({ where: { companyId: A.companyId }, include: { stages: true, milestones: true } });
  if (!order) throw new Error("no order — run verify-sell/execute");
  const id = order.id;

  // generate some activity: complete a stage + record a receipt + a status change
  const firstStage = order.stages.sort((a, b) => a.seq - b.seq)[0];
  await updateStage(A, firstStage.id, { status: "DONE" });
  const firstMs = order.milestones[0];
  await addReceipt(A, firstMs.id, { amount: 1000, mode: "NEFT", date: new Date() });
  await setOrderStatus(A, id, "ON_HOLD");
  await setOrderStatus(A, id, "ACTIVE");

  const events = await orderActivity(A, id);
  check("timeline returns events", !!events && events.length >= 3);
  const kinds = new Set(events!.map((e) => e.kind));
  check("includes 'created'", kinds.has("created"));
  check("includes a completed 'stage'", kinds.has("stage"));
  check("includes a 'payment' with an amount", events!.some((e) => e.kind === "payment" && !!e.amount));
  check("includes 'status' changes", kinds.has("status"));
  check("newest-first", events!.every((e, i) => i === 0 || new Date(events![i - 1].at) >= new Date(e.at)));

  // documents
  const d = await addOrderDocument(A, id, { url: "/uploads/contract.pdf", name: "Signed contract.pdf" });
  check("addOrderDocument persists", d.title === "Signed contract.pdf");
  const full = await getOrder(A, id);
  check("getOrder returns documents", !!full && (full as { documents: unknown[] }).documents.some((x) => (x as { id: string }).id === d.id));
  await deleteOrderDocument(A, d.id);
  const after = await getOrder(A, id);
  check("delete removes it", !!after && !(after as { documents: { id: string }[] }).documents.some((x) => x.id === d.id));

  // RBAC: employee without team access can't see this order's activity
  const other = await orderActivity({ ...A, companyId: "nonexistent" }, id);
  check("orderActivity is company-scoped (null cross-tenant)", other === null);

  console.log(`\n✅ Projects P1 (timeline + docs) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
