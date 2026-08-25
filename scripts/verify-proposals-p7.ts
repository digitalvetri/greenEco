/**
 * Verifies Proposals P7 (Phase B) — the type-aware document layer.
 *
 * Creates one proposal of EACH type against the live DB via the real services and
 * asserts: the per-technology template is seeded into documentData, the merge in
 * saveVersion doesn't blank it, the four technology variants genuinely differ, and
 * — the invariant that must not move — subtotal/GST/grandTotal and the Won→Order
 * milestone derivation are completely unaffected by the proposal type.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { getProposal, saveVersion, approveAndSend, markWon } from "@/server/services/proposal";
import { getCompanySettings } from "@/server/services/company-settings";
import { asProjectReportData, computeCapacity, computeLoadTotals } from "@/lib/domain/proposal-document";
import { PROJECT_REPORT_TECHNOLOGIES } from "@/lib/project-report-templates";
import { PROPOSAL_TYPES } from "@/lib/constants";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];
  const orderIds: string[] = [];
  const clientIds: string[] = [];

  const newLead = async (name: string, technology: string) => {
    const r = await createLead(A, {
      customerName: name,
      address: "7 Template Rd, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology,
      capacityKLD: 30,
    });
    if (!("lead" in r) || !r.lead) throw new Error("lead create failed");
    leadIds.push(r.lead.id);
    return r.lead.id;
  };

  try {
    // ---------- Company boilerplate resolves with no data entry ----------
    const settings = await getCompanySettings(A.companyId);
    check("company doc boilerplate falls back to the shipped defaults", settings.doc.introduction.length > 200);
    check("…including both scopes of work", settings.doc.scopeGreenEcocare.length > 100 && settings.doc.scopeClient.length > 100);
    check("…and a signatory for the cover letter", !!settings.doc.signatoryName && !!settings.doc.signatoryTitle);
    check("…and at least one recent project", settings.doc.recentProjects.length > 0);

    // ---------- One proposal per technology: the four variants must differ ----------
    const seededByTech: Record<string, ReturnType<typeof asProjectReportData>> = {};
    for (const tech of PROJECT_REPORT_TECHNOLOGIES) {
      const leadId = await newLead(`P7 ${tech} Co ${Date.now()}`, tech);
      const { proposalId } = await convertToProposal(A, leadId, {
        proposalType: "Project Proposal",
        technology: tech,
      });
      proposalIds.push(proposalId);

      const p = await getProposal(A, proposalId);
      const v = (p as { versions: Array<Record<string, unknown>> }).versions[0];
      const doc = asProjectReportData(v.documentData);
      seededByTech[tech] = doc;

      check(`${tech}: document seeded with the technology recommendation`, (doc.recommendation ?? "").length > 100);
      check(`${tech}: flow chart seeded`, (doc.flowChart ?? []).length > 5);
      check(`${tech}: process units seeded (shared + technology-specific)`, (doc.processUnits ?? []).length >= 6);
      check(`${tech}: equipment table seeded`, (doc.equipment ?? []).length >= 10);
      check(`${tech}: materials specification sheet seeded`, (doc.materialSpecs ?? []).length >= 10);
      check(`${tech}: inlet + outlet parameters seeded`, (doc.inletParameters ?? []).length === 4 && (doc.outletParameters ?? []).length === 4);
      check(`${tech}: cover letter seeded`, ((v.coverLetter as string) ?? "").length > 200);
      check(`${tech}: electrical load rows seeded on the version column`, ((v.electricalLoad as unknown[]) ?? []).length >= 5);
      check(`${tech}: technology explainer seeded`, ((v.technologyExplainer as string) ?? "").length > 50);
    }

    // The whole point of the per-technology layer: these must not be interchangeable.
    const recs = PROJECT_REPORT_TECHNOLOGIES.map((t) => seededByTech[t].recommendation);
    check("all four technologies got DIFFERENT recommendations", new Set(recs).size === 4);
    const flows = PROJECT_REPORT_TECHNOLOGIES.map((t) => (seededByTech[t].flowChart ?? []).join("|"));
    check("all four got different process-flow chains", new Set(flows).size === 4);
    check("SBR's equipment includes the decanting pump", (seededByTech.SBR.equipment ?? []).some((e) => e.name === "Decanting Pump"));
    check("MBBR's does not", !(seededByTech.MBBR.equipment ?? []).some((e) => e.name === "Decanting Pump"));
    check("MBR's includes a membrane unit", (seededByTech.MBR.equipment ?? []).some((e) => e.name === "Membrane unit"));
    check(
      "SBR's process units carry the six-stage batch write-up",
      (seededByTech.SBR.processUnits ?? []).some((u) => u.body.includes("Stage 4 — Decanting")),
    );

    // ---------- The saveVersion merge must not blank the seeded template ----------
    const mbbrId = proposalIds[0];
    await saveVersion(A, mbbrId, {
      documentData: { capacityCalc: { people: 500, usagePerHead: 45, factorOfSafety: 7500 } },
    });
    const afterMerge = asProjectReportData(
      ((await getProposal(A, mbbrId)) as { versions: Array<{ documentData: unknown }> }).versions[0].documentData,
    );
    check("a partial documentData save keeps the seeded recommendation", (afterMerge.recommendation ?? "").length > 100);
    check("…keeps the seeded equipment table", (afterMerge.equipment ?? []).length >= 10);
    check("…and applies the new capacity calculation", afterMerge.capacityCalc?.people === 500);

    const cap = computeCapacity(afterMerge.capacityCalc);
    check(`capacity maths matches the sample: 500 × 45 + 7500 = ${cap.designCapacityLPD} LPD ≈ ${cap.designCapacityKLD} KLD`,
      cap.designCapacityLPD === 30_000 && cap.designCapacityKLD === 30);

    // Omitting documentData entirely must also be non-destructive (the documented trap).
    await saveVersion(A, mbbrId, { technicalText: "Unrelated edit" });
    const afterOmit = asProjectReportData(
      ((await getProposal(A, mbbrId)) as { versions: Array<{ documentData: unknown }> }).versions[0].documentData,
    );
    check("omitting documentData does NOT blank it", afterOmit.capacityCalc?.people === 500 && (afterOmit.equipment ?? []).length >= 10);

    // ---------- Cross-type contamination is refused ----------
    let wrongTypeStripped = false;
    await saveVersion(A, mbbrId, { documentData: { estimateTitle: "SHOULD NOT LAND ON A PROJECT REPORT" } });
    const afterWrong = ((await getProposal(A, mbbrId)) as { versions: Array<{ documentData: Record<string, unknown> }> })
      .versions[0].documentData;
    wrongTypeStripped = !("estimateTitle" in (afterWrong ?? {}));
    check("a BOQ-only field is stripped from a Project Report's document", wrongTypeStripped);

    // ---------- Every proposal type is creatable end-to-end ----------
    const typeLead = await newLead(`P7 All Types Co ${Date.now()}`, "MBBR");
    for (const t of PROPOSAL_TYPES) {
      const { proposalId, already } = await convertToProposal(A, typeLead, { proposalType: t });
      if (!already) proposalIds.push(proposalId);
      const row = await prisma.proposal.findUnique({ where: { id: proposalId }, select: { proposalType: true } });
      check(`"${t}" is creatable and records its type`, row?.proposalType === t);
    }
    const boq = await prisma.proposal.findFirst({
      where: { leadId: typeLead, proposalType: "BOQ Proposal" },
      include: { versions: true },
    });
    const boqDoc = (boq?.versions[0]?.documentData ?? {}) as Record<string, unknown>;
    check("a BOQ proposal is seeded with its estimate headings", typeof boqDoc.estimateSubtitle === "string" && (boqDoc.estimateSubtitle as string).includes("MECHANICAL"));
    check("…and NOT with Project Report engineering content", !("equipment" in boqDoc) && !("flowChart" in boqDoc));

    // ---------- THE INVARIANT: money is untouched by the document layer ----------
    const priced = proposalIds[1]; // an SBR project report
    await saveVersion(A, priced, {
      boqItems: [
        { category: "Others", item: "Design and Detailed Engineering", unit: "Lot", qty: 1, rate: 50000, amount: 50000, aiSuggested: false },
        { category: "Others", item: "Mechanical Equipment's, Control Valves & Fitting Pipes", unit: "Lot", qty: 1, rate: 440000, amount: 440000, aiSuggested: false },
        { category: "Others", item: "Electrical and Instrumentation", unit: "Lot", qty: 1, rate: 220000, amount: 220000, aiSuggested: false },
        { category: "Others", item: "Erection, Commissioning & Supervisory Charges", unit: "Lot", qty: 1, rate: 70000, amount: 70000, aiSuggested: false },
      ],
    });
    const pricedV = ((await getProposal(A, priced)) as { versions: Array<Record<string, unknown>> }).versions[0];
    // The sample's own worked example: ₹7,80,000 + 18% = ₹9,20,400.
    check(`subtotal is the sample's ₹7,80,000 (got ${pricedV.subtotal})`, Number(pricedV.subtotal) === 780000);
    check(`GST is ₹1,40,400 (got ${pricedV.gstAmount})`, Number(pricedV.gstAmount) === 140400);
    check(`grand total is ₹9,20,400 (got ${pricedV.grandTotal})`, Number(pricedV.grandTotal) === 920400);

    await approveAndSend(A, priced);
    const won = await markWon(A, priced);
    orderIds.push(won.orderId);
    const order = await prisma.order.findUnique({
      where: { id: won.orderId },
      select: { projectValue: true, clientId: true, milestones: { select: { amount: true } } },
    });
    if (order?.clientId) clientIds.push(order.clientId);
    check("Won→Order project value equals the grand total", Number(order?.projectValue) === 920400);
    const milestoneSum = (order?.milestones ?? []).reduce((a, m) => a + Number(m.amount), 0);
    check(
      `milestones still sum to the grand total (${milestoneSum}) — the document layer changed no money`,
      Math.abs(milestoneSum - 920400) < 1,
    );

    // ---------- Load maths reproduces the client's printed figures ----------
    const sbrLoad = computeLoadTotals(
      (((await getProposal(A, proposalIds[1])) as { versions: Array<{ electricalLoad: unknown }> }).versions[0]
        .electricalLoad ?? []) as { description: string; hp: number }[],
    );
    check(`SBR load chain reproduces the sample: ${sbrLoad.hp} HP → ${sbrLoad.requiredHp} HP → ${sbrLoad.supplyKw} kW`,
      sbrLoad.hp === 11.6 && sbrLoad.requiredHp === 13 && sbrLoad.supplyKw === 10);

    // ---------- The widened electricalLoad row shape must survive an editor save ----------
    // The editor's own row type is {description, hp, hpPerUnit?, units?, running?, standby?}
    // and it edits by spreading. Assert the extra columns actually round-trip, because if
    // they silently drop, the Project Report's 7-column load table degrades to 2 columns
    // after the admin's first save — invisible until the PDF is printed.
    // Use the ASP proposal: proposalIds[1] (SBR) was won above and a won proposal is
    // correctly locked against further edits.
    const loadProposal = proposalIds[2];
    const beforeRows = (((await getProposal(A, loadProposal)) as { versions: Array<{ electricalLoad: unknown }> })
      .versions[0].electricalLoad ?? []) as Record<string, unknown>[];
    check("seeded load rows carry the widened columns", beforeRows.every((r) => "units" in r && "running" in r && "standby" in r));

    // Send them back exactly as the editor would after touching one cell.
    await saveVersion(A, loadProposal, {
      electricalLoad: beforeRows.map((r, i) => (i === 0 ? { ...r, hp: 2 } : { ...r })) as never,
    });
    const afterRows = (((await getProposal(A, loadProposal)) as { versions: Array<{ electricalLoad: unknown }> })
      .versions[0].electricalLoad ?? []) as Record<string, unknown>[];
    check("…and still carry them after a save", afterRows.every((r) => "units" in r && "running" in r && "standby" in r));
    check("…with the per-unit HP preserved", afterRows[1]?.hpPerUnit === 5);
    const afterTotals = computeLoadTotals(afterRows as { description: string; hp: number }[]);
    check(
      `…so the load chain still computes (${afterTotals.units} units / ${afterTotals.running} running / ${afterTotals.hp} HP)`,
      // ASP has five rows: 9 units, 5 running, 4 standby — the honest sums, not the
      // sample's copy-pasted 10/6.
      afterTotals.units === 9 && afterTotals.running === 5 && afterTotals.standby === 4,
    );

    // ---------- No silent substitution for a technology with no document ----------
    const saffLead = await newLead(`P7 SAFF Co ${Date.now()}`, "SAFF");
    const saff = await convertToProposal(A, saffLead, { proposalType: "Project Proposal", technology: "SAFF" });
    proposalIds.push(saff.proposalId);
    const saffDoc = asProjectReportData(
      ((await getProposal(A, saff.proposalId)) as { versions: Array<{ documentData: unknown }> }).versions[0].documentData,
    );
    check("SAFF (no sample document) seeds NO recommendation rather than MBBR's", !saffDoc.recommendation);
    check("…no equipment table", (saffDoc.equipment ?? []).length === 0);
    check("…no flow chart", (saffDoc.flowChart ?? []).length === 0);
    check("…but still gets the technology-agnostic water-quality defaults", (saffDoc.inletParameters ?? []).length === 4);
    const saffLoad = ((await getProposal(A, saff.proposalId)) as { versions: Array<{ electricalLoad: unknown }> })
      .versions[0].electricalLoad;
    check("…and no borrowed electrical load table", ((saffLoad as unknown[]) ?? []).length === 0);

    console.log(`\n✅ verify-proposals-p7: ${pass} checks passed`);
  } finally {
    await prisma.stage.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.paymentMilestone.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.budget.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.location.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...orderIds, ...proposalIds] } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.proposalOutcome.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.contactPerson.updateMany({ where: { clientId: { in: clientIds } }, data: { clientId: null } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    await prisma.followUp.deleteMany({ where: { leadId: { in: leadIds } } });
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
