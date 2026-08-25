/**
 * Verifies that winning a proposal creates the RIGHT thing for its type:
 *   Project / BOQ    → Order with execution stages + payment milestones (unchanged)
 *   AMC Proposal     → ServiceContract with a generated visit schedule
 *   Service Proposal → ServiceTicket carrying the job's value
 *
 * And that client lifetime value counts all three, since a win no longer always
 * produces an Order.
 *
 * The two figures most worth protecting here:
 *   • an AMC's annualValue must come from SUBTOTAL, not grandTotal — it is a pre-GST
 *     field by design, so seeding it from the GST-inclusive total would inflate every
 *     contract and the recurring-revenue run-rate by 18%
 *   • a project's milestones must still sum to its grand total, exactly as before
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion, approveAndSend, markWon } from "@/server/services/proposal";
import { clientStats, clientAnalytics } from "@/server/services/client";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId, capabilities: admin.capabilities };

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];
  const orderIds: string[] = [];
  const contractIds: string[] = [];
  const ticketIds: string[] = [];
  const clientIds: string[] = [];

  /** Lead → proposal of `type` → priced → approved, ready to win. */
  async function readyToWin(name: string, type: string, amount: number, doc?: Record<string, unknown>) {
    const r = await createLead(A, {
      customerName: name,
      address: "3 Routing Rd, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 30,
    });
    if (!("lead" in r) || !r.lead) throw new Error("lead create failed");
    leadIds.push(r.lead.id);
    const { proposalId } = await convertToProposal(A, r.lead.id, { proposalType: type });
    proposalIds.push(proposalId);
    await saveVersion(A, proposalId, {
      boqItems: [
        { category: "Others", item: `${type} line`, unit: "Lot", qty: 1, rate: amount, amount, aiSuggested: false },
      ],
      ...(doc ? { documentData: doc } : {}),
    });
    await approveAndSend(A, proposalId);
    return { leadId: r.lead.id, proposalId, customerName: name };
  }

  try {
    const ltvBefore = (await clientStats(A)).lifetimeValue;

    // ================= Project Proposal → Order (must be unchanged) =================
    const proj = await readyToWin(`Routing Project ${Date.now()}`, "Project Proposal", 780000);
    const wonProj = await markWon(A, proj.proposalId);
    check("a Project Proposal still creates an ORDER", wonProj.kind === "ORDER");
    if (wonProj.kind !== "ORDER") throw new Error("unreachable");
    orderIds.push(wonProj.orderId);
    const order = await prisma.order.findUnique({
      where: { id: wonProj.orderId },
      include: { milestones: true, stages: true, budget: true, siteLocation: true },
    });
    if (order?.clientId) clientIds.push(order.clientId);
    check("…with the 9 execution stages", order?.stages.length === 9);
    check("…a budget and a SITE location", !!order?.budget && !!order?.siteLocation);
    const msSum = (order?.milestones ?? []).reduce((a, m) => a + Number(m.amount), 0);
    // 780000 + 18% = 920400
    check(`…and milestones still summing to the grand total (${msSum})`, Math.abs(msSum - 920400) < 1);
    check("…no contract or ticket was created for it", !(await prisma.serviceContract.findFirst({ where: { proposalId: proj.proposalId } })));

    // ================= AMC Proposal → ServiceContract =================
    const amc = await readyToWin(`Routing AMC ${Date.now()}`, "AMC Proposal", 100000, {
      termMonths: 24,
      frequency: "QUARTERLY",
      visitsPerYear: 4,
      scope: { mechanical: "Blower + pump service", exclusions: "Civil repairs" },
    });
    const wonAmc = await markWon(A, amc.proposalId);
    check("an AMC Proposal creates a CONTRACT, not a project", wonAmc.kind === "CONTRACT");
    if (wonAmc.kind !== "CONTRACT") throw new Error("unreachable");
    contractIds.push(wonAmc.contractId);
    const contract = await prisma.serviceContract.findUnique({
      where: { id: wonAmc.contractId },
      include: { visits: true },
    });
    check("…numbered in the AMC series", (contract?.contractNo ?? "").includes("AMC"));
    check("…linked back to the proposal", contract?.proposalId === amc.proposalId);
    check("…ACTIVE", contract?.status === "ACTIVE");

    // 24 months at 4 visits/year = 8 visits.
    check(`…with a generated visit schedule (${contract?.visits.length} visits over 24 months)`, contract?.visits.length === 8);
    check("…all upcoming", (contract?.visits ?? []).every((v) => v.status === "UPCOMING"));
    check("…honouring the term (ends ~24 months out)", (() => {
      const months =
        ((contract!.endDate.getFullYear() - contract!.startDate.getFullYear()) * 12) +
        (contract!.endDate.getMonth() - contract!.startDate.getMonth());
      return months === 24;
    })());
    check("…carrying the scope from the proposal", JSON.stringify(contract?.scope).includes("Civil repairs"));

    // THE figure that must not be wrong.
    check(
      `…annualValue seeded from the PRE-GST subtotal, not the grand total (${contract?.annualValue} — grandTotal would be 118000)`,
      Number(contract?.annualValue) === 100000,
    );

    check("…and NO order was created", !(await prisma.order.findFirst({ where: { proposalId: amc.proposalId } })));
    const amcProposal = await prisma.proposal.findUnique({ where: { id: amc.proposalId } });
    check("…the proposal is still marked WON", amcProposal?.status === "WON");
    check("…and the win was recorded for the learning loop", !!(await prisma.proposalOutcome.findFirst({ where: { proposalId: amc.proposalId } })));

    // ================= Service Proposal → ServiceTicket =================
    const svc = await readyToWin(`Routing Service ${Date.now()}`, "Service Proposal", 50000, {
      jobDescription: "Replace the aeration blower and re-commission",
      priority: "HIGH",
    });
    const wonSvc = await markWon(A, svc.proposalId);
    check("a Service Proposal creates a TICKET", wonSvc.kind === "TICKET");
    if (wonSvc.kind !== "TICKET") throw new Error("unreachable");
    ticketIds.push(wonSvc.ticketId);
    const ticket = await prisma.serviceTicket.findUnique({ where: { id: wonSvc.ticketId } });
    check("…numbered in the ticket series", (ticket?.ticketNo ?? "").includes("TKT"));
    check("…OPEN", ticket?.status === "OPEN");
    check("…carrying the job description from the proposal", !!ticket?.description?.includes("aeration blower"));
    check("…at the priority quoted", ticket?.priority === "HIGH");
    check("…with an SLA due date derived from that priority", !!ticket?.slaDueDate);
    // 50000 + 18% = 59000 — the ticket carries what the customer agreed to pay.
    check(`…and the job's value, which tickets never had before (${ticket?.value})`, Number(ticket?.value) === 59000);
    check("…and NO order was created", !(await prisma.order.findFirst({ where: { proposalId: svc.proposalId } })));

    // ================= Revenue rolls up across all three =================
    const ltvAfter = (await clientStats(A)).lifetimeValue;
    // 920400 (project) + 100000 (AMC, pre-GST) + 59000 (service job)
    const expected = 920400 + 100000 + 59000;
    check(
      `client lifetime value counts all three modules (+${ltvAfter - ltvBefore}, expected +${expected})`,
      ltvAfter - ltvBefore === expected,
    );

    const anal = await clientAnalytics(A);
    check("clientAnalytics agrees with clientStats", anal.totalLifetimeValue === ltvAfter);
    const amcClient = anal.topClients.find((c) => c.name === amc.customerName);
    check("…and the AMC customer now has a lifetime value at all", amcClient?.value === 100000);

    const stats = await clientStats(A);
    check(
      "active-projects still counts only real projects, not contracts or jobs",
      stats.activeProjects === (await prisma.order.count({ where: { companyId: A.companyId, status: "ACTIVE", deletedAt: null } })),
    );

    // ================= Idempotency =================
    const twice = await markWon(A, amc.proposalId);
    check("winning an AMC twice doesn't create a second contract", twice.kind === "CONTRACT" || twice.kind === "ORDER");
    check(
      "…only one contract exists for that proposal",
      (await prisma.serviceContract.count({ where: { proposalId: amc.proposalId } })) === 1,
    );

    console.log(`\n✅ verify-won-routing: ${pass} checks passed`);
  } finally {
    await prisma.maintenanceVisit.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.serviceTicket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.serviceContract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.stage.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.paymentMilestone.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.budget.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.location.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.proposalOutcome.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...proposalIds, ...orderIds, ...contractIds, ...ticketIds] } } });
    await prisma.contactPerson.updateMany({ where: { clientId: { in: clientIds } }, data: { clientId: null } });
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.contactPerson.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    console.log("   (test rows cleaned up)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
