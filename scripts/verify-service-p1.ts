/**
 * Verifies Service/AMC P1 — the merged activity timeline (amcActivity) and the
 * tri-... quad-polymorphic client comms (logContractComm / sendContractWhatsApp /
 * sendContractEmail + contract→order→proposal→lead contact resolution). Fixtures
 * are created with a fixed key and cleaned up, so the script is idempotent.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  amcActivity,
  getContract,
  generateAmcInvoice,
  logContractComm,
  sendContractWhatsApp,
  setContractStatus,
} from "@/server/services/amc";

const KEY_LINKED = "GEC-AMC-VERIFY-P1-LINKED";
const KEY_BARE = "GEC-AMC-VERIFY-P1-BARE";

async function cleanup() {
  for (const no of [KEY_LINKED, KEY_BARE]) {
    await prisma.communication.deleteMany({ where: { contract: { contractNo: no } } });
    await prisma.serviceTicket.deleteMany({ where: { contract: { contractNo: no } } });
    await prisma.maintenanceVisit.deleteMany({ where: { contract: { contractNo: no } } });
    await prisma.serviceContract.deleteMany({ where: { contractNo: no } });
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
  const order = await prisma.order.findFirst({ where: { companyId: A.companyId }, include: { proposal: { select: { lead: { select: { phone: true } } } } } });
  if (!order) throw new Error("need an order (with proposal→lead) to test contact resolution");

  const now = new Date();
  // Linked fixture: an order-linked contract with a completed visit + a resolved ticket.
  const linked = await prisma.serviceContract.create({
    data: {
      companyId: A.companyId, contractNo: KEY_LINKED, orderId: order.id, clientName: "P1 Linked Client",
      siteAddress: "P1 Site", startDate: new Date(now.getTime() - 200 * 86_400_000), endDate: new Date(now.getTime() + 165 * 86_400_000),
      annualValue: "240000.00", frequency: "QUARTERLY", visitsPerYear: 4, scope: {}, status: "ACTIVE", createdById: A.userId,
      visits: { create: [{ seq: 1, scheduledDate: new Date(now.getTime() - 30 * 86_400_000), actualDate: new Date(now.getTime() - 29 * 86_400_000), status: "DONE", readings: { ph: 7.2, do: 3.5 } }] },
      tickets: { create: [{ companyId: A.companyId, ticketNo: KEY_LINKED + "-T1", title: "P1 blower", description: "d", raisedBy: "Client", priority: "HIGH", status: "RESOLVED", closedAt: now, createdById: A.userId }] },
    },
  });

  // 1 — logContractComm creates a contract-scoped Communication + audits.
  const comm = await logContractComm(A, { contractId: linked.id, channel: "CALL", body: "P1 verify — coordination call" });
  const persisted = await prisma.communication.findUnique({ where: { id: comm.id } });
  check("logContractComm creates Communication with contractId", persisted?.contractId === linked.id);
  const cAudit = await prisma.auditLog.findFirst({ where: { entity: "Communication", entityId: comm.id, action: "CREATE" } });
  check("comm creation audited", !!cAudit);

  // 2 — a status change so the timeline has a status event.
  await setContractStatus(A, linked.id, "CANCELLED");
  await setContractStatus(A, linked.id, "ACTIVE");

  // 3 — amcActivity merges every source, newest-first.
  const acts = (await amcActivity(A, linked.id))!;
  check("amcActivity returns events", acts.length > 0);
  check("timeline has 'created'", acts.some((e) => e.kind === "created"));
  check("timeline has completed 'visit' (with readings)", acts.some((e) => e.kind === "visit" && !!e.detail));
  check("timeline has 'ticket' (raised + resolved)", acts.filter((e) => e.kind === "ticket").length >= 2);
  check("timeline has 'comm'", acts.some((e) => e.kind === "comm"));
  check("timeline has 'status' change", acts.some((e) => e.kind === "status"));
  const sorted = acts.every((e, i) => i === 0 || new Date(acts[i - 1].at).getTime() >= new Date(e.at).getTime());
  check("timeline is newest-first", sorted);

  // 4 — send gated to LOGGED (order→proposal→lead phone resolves; no transport).
  const wa = await sendContractWhatsApp(A, linked.id, "P1 verify — WhatsApp");
  check("sendContractWhatsApp gated to LOGGED", wa.comm.sentStatus === "LOGGED" && !wa.delivery.sent);

  // 4b — an AMC invoice surfaces on the timeline WITH its ₹ amount (money-in trail).
  const inv = await generateAmcInvoice(A, linked.id, "Q1 verify");
  const withInvoice = (await amcActivity(A, linked.id))!;
  const invEvent = withInvoice.find((e) => e.kind === "invoice");
  check("timeline has an 'invoice' event", !!invEvent);
  check("invoice event carries a ₹ amount", !!invEvent?.amount && invEvent.amount.includes("₹"));

  // 4c — RBAC: getContract strips annualValue for EMPLOYEE (the detail-page money guard).
  const empView = await getContract(E, linked.id);
  check("getContract strips annualValue for EMPLOYEE", !!empView && !("annualValue" in empView));
  const adminView = await getContract(A, linked.id);
  check("getContract keeps annualValue for ADMIN", !!adminView && "annualValue" in adminView);
  await prisma.invoice.deleteMany({ where: { id: inv.invoiceId } }); // restore

  // 5 — a BARE contract (no order link) can't resolve a phone → send is blocked.
  const bare = await prisma.serviceContract.create({
    data: {
      companyId: A.companyId, contractNo: KEY_BARE, clientName: "P1 Bare Client", siteAddress: "x",
      startDate: now, endDate: new Date(now.getTime() + 365 * 86_400_000), annualValue: "1.00",
      frequency: "YEARLY", visitsPerYear: 1, scope: {}, status: "ACTIVE", createdById: A.userId,
    },
  });
  check("send blocked when no project link (no resolvable phone)", await expectThrow(() => sendContractWhatsApp(A, bare.id, "hi")));
  check("but logContractComm still works on a bare contract", !!(await logContractComm(A, { contractId: bare.id, channel: "CALL", body: "logged" })));

  await cleanup();
  console.log(`\n✅ Service/AMC P1 (timeline + comms) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
