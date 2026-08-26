/**
 * Verifies the two document formats the client supplied last (AMC Quotation and the
 * Service Proforma Invoice) end-to-end against the live DB, plus the request trail
 * now shown on the proposals list.
 *
 * The spine is the AMC sample's OWN worked example. If four charge lines quoted at
 * ₹75,000 / ₹10,000 / ₹65,000 / ₹25,000 per month over 12 months do not reconcile to
 * ₹1,75,000 per month, ₹21,00,000 subtotal, ₹3,78,000 GST and ₹24,78,000 total — in
 * digits AND in words — then the qty×rate storage decision is wrong and the printed
 * table would contradict the stored total.
 *
 * It also pins the figure v48 protects: ServiceContract.annualValue seeds from the
 * PRE-GST subtotal, so an AMC won here must produce a ₹21,00,000 contract, not
 * ₹24,78,000.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion, approveAndSend, markWon, getProposal, listProposals } from "@/server/services/proposal";
import { createProposalRequest } from "@/server/services/proposal-request";
import { amountInWords } from "@/lib/money";
import { asAmcProposalData, asServiceProposalData } from "@/lib/domain/proposal-document";
import { amcRatesValidityNote, DEFAULT_AMC_NOTES } from "@/lib/project-report-boilerplate";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const employee = await prisma.user.findFirst({
    where: { companyId: admin.companyId, role: "EMPLOYEE", active: true },
  });
  if (!employee) throw new Error("need an EMPLOYEE user — run db:seed");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId, capabilities: admin.capabilities };
  const E = { userId: employee.id, role: employee.role, companyId: employee.companyId, capabilities: employee.capabilities };

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];
  const requestIds: string[] = [];
  const contractIds: string[] = [];
  const ticketIds: string[] = [];
  const clientIds: string[] = [];

  async function newLead(name: string, as: typeof A = A) {
    const r = await createLead(as, {
      customerName: name,
      address: "Krishnagiri",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "SBR",
      capacityKLD: 1000,
    });
    if (!("lead" in r) || !r.lead) throw new Error("lead create failed");
    leadIds.push(r.lead.id);
    return r.lead.id;
  }

  try {
    // ================= AMC: the sample's own arithmetic =================
    const amcLead = await newLead(`AMC Doc Co ${Date.now()}`);
    const { proposalId: amcId } = await convertToProposal(A, amcLead, { proposalType: "AMC Proposal" });
    proposalIds.push(amcId);

    const seeded = asAmcProposalData((await getProposal(A, amcId))?.versions[0]?.documentData);
    check("a new AMC seeds the client's 11 scope notes", seeded.notes === DEFAULT_AMC_NOTES);
    check("…the units list from the SBR template", (seeded.units ?? []).some((u) => /SBR Tank/i.test(u)));
    check("…and its machinery list", (seeded.equipment ?? []).length > 0);
    check("…with the rates-validity line matching a 12-month term", seeded.ratesValidityNote === "The above rates are for 1 year only.");

    const MONTHS = 12;
    const perMonth = [75000, 10000, 65000, 25000];
    await saveVersion(A, amcId, {
      boqItems: perMonth.map((rate, i) => ({
        category: "Others",
        item: `AMC line ${i + 1}`,
        unit: "Month",
        qty: MONTHS,
        rate,
        amount: rate * MONTHS,
        aiSuggested: false,
      })),
      documentData: {
        termMonths: MONTHS,
        additionalPlants: [{ plantType: "ETP", capacityValue: 100, capacityUnit: "KLD" }],
      },
    });

    const amcDoc = await getProposal(A, amcId);
    const v = amcDoc!.versions[0]!;
    check(`Sub Total is the sample's ₹21,00,000 (got ${v.subtotal})`, Number(v.subtotal) === 2100000);
    check(`GST 18% is ₹3,78,000 (got ${v.gstAmount})`, Number(v.gstAmount) === 378000);
    check(`Total with GST is ₹24,78,000 (got ${v.grandTotal})`, Number(v.grandTotal) === 2478000);
    const words = amountInWords(Number(v.grandTotal)).toUpperCase();
    check(
      `…and in words: "${words}"`,
      words.includes("TWENTY FOUR LAKH") && words.includes("SEVENTY EIGHT THOUSAND"),
    );
    const perMonthSum = v.boqItems.reduce((a: number, b: { rate: unknown }) => a + Number(b.rate), 0);
    check(`the per-month column sums to ₹1,75,000 (got ${perMonthSum})`, perMonthSum === 175000);
    check(
      "every line's rate × months equals its amount (or the printed table contradicts the total)",
      v.boqItems.every((b: { rate: unknown; qty: unknown; amount: unknown }) => Math.abs(Number(b.rate) * Number(b.qty) - Number(b.amount)) < 0.01),
    );
    check("months are stored as the unit, not a bare 'Lot'", v.boqItems.every((b: { unit: string }) => b.unit === "Month"));

    const merged = asAmcProposalData(v.documentData);
    check("the second plant survives the save", merged.additionalPlants?.[0]?.plantType === "ETP");
    check("…without disturbing the seeded notes (the shallow-merge rule)", merged.notes === DEFAULT_AMC_NOTES);
    check("…or the seeded units", (merged.units ?? []).length > 0);

    // A longer term must not print "for 1 year only".
    check("a 24-month term restates itself correctly", amcRatesValidityNote(24) === "The above rates are for 2 years only.");
    check("…and an odd term does too", amcRatesValidityNote(18) === "The above rates are for 18 months only.");

    // v48's figure: the contract takes the PRE-GST subtotal.
    await approveAndSend(A, amcId);
    const won = await markWon(A, amcId);
    check("winning it creates a contract", won.kind === "CONTRACT");
    if (won.kind !== "CONTRACT") throw new Error("unreachable");
    contractIds.push(won.contractId);
    const contract = await prisma.serviceContract.findUnique({ where: { id: won.contractId } });
    const order = await prisma.order.findFirst({ where: { proposalId: amcId } });
    if (order?.clientId) clientIds.push(order.clientId);
    check(
      `annualValue is the PRE-GST ₹21,00,000, not the GST-inclusive total (got ${contract?.annualValue})`,
      Number(contract?.annualValue) === 2100000,
    );

    // ================= Service: the proforma =================
    const svcLead = await newLead(`Service Doc Co ${Date.now()}`);
    const { proposalId: svcId } = await convertToProposal(A, svcLead, { proposalType: "Service Proposal" });
    proposalIds.push(svcId);
    await saveVersion(A, svcId, {
      validityDays: 45,
      boqItems: [
        { category: "Others", item: "Collection Pump No: 2 Service", unit: "No", qty: 1, rate: 12000, amount: 12000, aiSuggested: false },
        { category: "Others", item: "Filter Feed Pump No: 1 & 5", unit: "No", qty: 2, rate: 9000, amount: 18000, aiSuggested: false },
        { category: "Others", item: "Level Sensor Probes", unit: "No", qty: 15, rate: 1400, amount: 21000, aiSuggested: false },
      ],
      documentData: { jobDescription: "Pump servicing and sensor replacement", priority: "HIGH" },
    });
    const svc = (await getProposal(A, svcId))!.versions[0]!;
    check(`the proforma's quantity × rate reconciles (₹51,000, got ${svc.subtotal})`, Number(svc.subtotal) === 51000);
    check("…rates are preserved per line (the proforma PRINTS them, unlike the BOQ)", svc.boqItems.every((b: { rate: unknown }) => Number(b.rate) > 0));
    check("…and its validity is the proposal's own, not a hardcoded 45", svc.validityDays === 45);
    const svcDoc = asServiceProposalData(svc.documentData);
    check("the job description is stored for the ticket", !!svcDoc.jobDescription);

    await approveAndSend(A, svcId);
    const wonSvc = await markWon(A, svcId);
    check("winning it books a service ticket", wonSvc.kind === "TICKET");
    if (wonSvc.kind === "TICKET") ticketIds.push(wonSvc.ticketId);

    // ================= The request trail on the list =================
    // Raised by the EMPLOYEE, so it is their own enquiry — a request against
    // someone else's lead is correctly refused by accessibleLead.
    const trailLead = await newLead(`Trail Co ${Date.now()}`, E);
    const req = await createProposalRequest(E, {
      leadId: trailLead,
      proposalType: "BOQ Proposal",
      notes: "Customer asked for a machinery estimate",
    });
    requestIds.push(req.id);
    const { proposalId: trailId } = await convertToProposal(A, trailLead, {
      proposalType: "BOQ Proposal",
      requestId: req.id,
    });
    proposalIds.push(trailId);

    const listed = (await listProposals(A, { take: 100 })).items.find((x) => x.id === trailId);
    check("a proposal made from a request carries the trail", !!listed?.requestedBy);
    check(`…naming who asked for it (${listed?.requestedBy?.name})`, listed?.requestedBy?.name === employee.name);

    const plain = (await listProposals(A, { take: 100 })).items.find((x) => x.id === amcId);
    check("…while one created directly has no trail, rather than a fabricated one", plain?.requestedBy === null);

    console.log(`\n✅ verify-proposals-p9: ${pass} checks passed`);
  } finally {
    await prisma.maintenanceVisit.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.serviceTicket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.serviceContract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.proposalRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.automationTask.deleteMany({ where: { entityId: { in: requestIds } } });
    await prisma.proposalOutcome.deleteMany({ where: { proposalId: { in: proposalIds } } });
    const orders = await prisma.order.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    const oids = orders.map((o) => o.id);
    await prisma.stage.deleteMany({ where: { orderId: { in: oids } } });
    await prisma.paymentMilestone.deleteMany({ where: { orderId: { in: oids } } });
    await prisma.budget.deleteMany({ where: { orderId: { in: oids } } });
    await prisma.location.deleteMany({ where: { orderId: { in: oids } } });
    await prisma.order.deleteMany({ where: { id: { in: oids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...proposalIds, ...requestIds, ...oids, ...contractIds, ...ticketIds] } } });
    await prisma.contactPerson.updateMany({ where: { clientId: { in: clientIds } }, data: { clientId: null } });
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((x) => x.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.followUp.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.contactPerson.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.followUp.deleteMany({ where: { leadId: { in: leadIds } } });
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
