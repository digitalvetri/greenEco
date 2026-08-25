/**
 * Verifies Proposals P6 — the employee→admin proposal-request flow, the 1:many
 * lead→proposals change, and the office-only visibility gate.
 *
 * Drives the REAL service functions against the live DB (no simulation), in both
 * roles, then cleans up every row it created.
 *
 * The important assertions are the negative ones: an employee must not be able to
 * reach an unconfirmed (DRAFT) proposal through the list, global search, a direct
 * id, the clients surface, or the analytics aggregates.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal, getLead, leadActivity } from "@/server/services/lead";
import {
  getProposal,
  listProposals,
  proposalStats,
  proposalAnalytics,
  proposalActivity,
  approveAndSend,
  saveVersion,
  markWon,
} from "@/server/services/proposal";
import {
  createProposalRequest,
  listProposalRequests,
  reviewProposalRequest,
  pendingProposalRequestCount,
} from "@/server/services/proposal-request";
import { searchAll } from "@/server/services/search";
import { listClients, clientStats, clientAnalytics, allClientsForExport } from "@/server/services/client";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const employee = await prisma.user.findFirst({
    where: { companyId: admin.companyId, role: "EMPLOYEE", active: true },
  });
  if (!employee) throw new Error("need an EMPLOYEE user — run db:seed");

  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: employee.id, role: employee.role, companyId: employee.companyId };

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const created: {
    leadIds: string[];
    proposalIds: string[];
    requestIds: string[];
    orderIds: string[];
    clientIds: string[];
  } = { leadIds: [], proposalIds: [], requestIds: [], orderIds: [], clientIds: [] };

  try {
    // ---------- The employee raises a request against their own enquiry ----------
    const leadRes = await createLead(E, {
      customerName: `P6 Request Co ${Date.now()}`,
      address: "12 Verify Rd, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "SBR",
      capacityKLD: 30,
    });
    if (!("lead" in leadRes) || !leadRes.lead) throw new Error("lead create failed");
    const leadId = leadRes.lead.id;
    created.leadIds.push(leadId);

    const req = await createProposalRequest(E, {
      leadId,
      proposalType: "Project Proposal",
      technology: "SBR",
      notes: "120-flat apartment, treated water for gardening",
    });
    created.requestIds.push(req.id);
    check("employee can create a proposal request (no requireAdmin on that path)", req.status === "PENDING");
    check("request carries the technology the employee chose", req.technology === "SBR");

    // ---------- Duplicate + cross-tenant guards ----------
    let dupBlocked = false;
    try {
      await createProposalRequest(E, { leadId, proposalType: "Project Proposal" });
    } catch {
      dupBlocked = true;
    }
    check("a second open request for the same (lead, type) is rejected", dupBlocked);

    const otherLead = await prisma.lead.findFirst({
      where: { companyId: { not: admin.companyId } },
      select: { id: true },
    });
    if (otherLead) {
      let crossTenantBlocked = false;
      try {
        await createProposalRequest(E, { leadId: otherLead.id, proposalType: "BOQ Proposal" });
      } catch {
        crossTenantBlocked = true;
      }
      check("a cross-tenant leadId is rejected", crossTenantBlocked);
    } else {
      console.log("  – skipped cross-tenant check (single-tenant DB)");
    }

    // ---------- The admin sees it; the employee sees only their own ----------
    const adminQueue = await listProposalRequests(A, { take: 100 });
    check("admin sees the request in the queue", adminQueue.items.some((r) => r.id === req.id));

    const empQueue = await listProposalRequests(E, { take: 100 });
    check("employee sees their own request", empQueue.items.some((r) => r.id === req.id));
    check(
      "employee's queue contains ONLY their own requests",
      empQueue.items.every((r) => r.requestedById === E.userId),
    );
    check("pending count is non-zero for the admin", (await pendingProposalRequestCount(A)) > 0);

    // ---------- Admin accepts, then creates the proposal from the request ----------
    await reviewProposalRequest(A, req.id, "ACCEPTED");
    const accepted = await prisma.proposalRequest.findUnique({ where: { id: req.id } });
    check("accepting records the reviewer", accepted?.status === "ACCEPTED" && accepted.reviewedById === A.userId);

    const conv = await convertToProposal(A, leadId, {
      proposalType: "Project Proposal",
      technology: "SBR",
      requestId: req.id,
    });
    const proposalId = conv.proposalId;
    created.proposalIds.push(proposalId);

    const fulfilled = await prisma.proposalRequest.findUnique({ where: { id: req.id } });
    check("creating the proposal marks the request FULFILLED", fulfilled?.status === "FULFILLED");
    check("the fulfilled request points at the new proposal", fulfilled?.proposalId === proposalId);

    const madeProposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
    check("the proposal records its type", madeProposal?.proposalType === "Project Proposal");
    check("the requested technology wins over the lead's", madeProposal?.technology === "SBR");
    check("a newly created proposal starts unconfirmed (DRAFT)", madeProposal?.status === "DRAFT");

    // ---------- THE VISIBILITY GATE — every read surface, while still DRAFT ----------
    check("admin CAN open the draft directly", (await getProposal(A, proposalId)) !== null);
    check("employee CANNOT open the draft directly", (await getProposal(E, proposalId)) === null);
    check("employee CANNOT read the draft's activity/price trail", (await proposalActivity(E, proposalId)) === null);

    const empList = await listProposals(E, { take: 100 });
    check("draft is absent from the employee's proposals list", !empList.items.some((p) => p.id === proposalId));
    const adminList = await listProposals(A, { take: 100 });
    check("draft IS present in the admin's proposals list", adminList.items.some((p) => p.id === proposalId));

    const number = madeProposal!.number;
    const empSearch = await searchAll(E, number);
    check("draft does not leak through the employee's ⌘K search", !empSearch.some((h) => h.id === proposalId));
    const adminSearch = await searchAll(A, number);
    check("admin's ⌘K search does find it", adminSearch.some((h) => h.id === proposalId));

    const empStats = await proposalStats(E);
    check("employee's draft KPI is 0 (drafts are office-only)", empStats.draft === 0);

    const empAnalytics = await proposalAnalytics(E);
    check(
      "draft is excluded from the employee's analytics funnel",
      !empAnalytics.funnel.some((f) => f.status === "DRAFT"),
    );

    const empLead = await getLead(E, leadId);
    check(
      "draft is hidden from the lead detail's proposal badges for an employee",
      !!empLead && !empLead.proposals.some((p) => p.id === proposalId),
    );
    const adminLead = await getLead(A, leadId);
    check(
      "admin's lead detail DOES show the draft",
      !!adminLead && adminLead.proposals.some((p) => p.id === proposalId),
    );

    const empClients = await listClients(E, { take: 200 });
    check(
      "a lead whose only proposal is a draft is not yet a 'client' for an employee",
      !empClients.items.some((c) => c.id === leadId),
    );

    const empExport = await allClientsForExport(E);
    check(
      "draft produces no row in the employee's client export",
      !empExport.some((r) => r.proposalNo === number),
    );

    // ---------- The admin confirms → it becomes visible ----------
    // Approve & Send needs a version; give it a real BOQ so totals are non-zero.
    await saveVersion(A, proposalId, {
      boqItems: [
        { category: "Civil", item: "RCC tanks", unit: "Lot", qty: 1, rate: 250000, amount: 250000, aiSuggested: false },
        { category: "PumpsBlowers", item: "Air Blower 5HP", unit: "Nos", qty: 2, rate: 90000, amount: 180000, aiSuggested: false },
      ],
    });
    const approved = await approveAndSend(A, proposalId);
    check("approve & send confirms the proposal", "sent" in approved && approved.sent === true);

    const afterConfirm = await prisma.proposal.findUnique({ where: { id: proposalId } });
    check("confirmed proposal is no longer DRAFT", afterConfirm?.status === "SENT");

    check("employee CAN now open it", (await getProposal(E, proposalId)) !== null);
    const empListAfter = await listProposals(E, { take: 100 });
    check("it now appears in the employee's list", empListAfter.items.some((p) => p.id === proposalId));
    const empSearchAfter = await searchAll(E, number);
    check("it now appears in the employee's search", empSearchAfter.some((h) => h.id === proposalId));
    const empClientsAfter = await listClients(E, { take: 200 });
    check("the lead now counts as a client for the employee", empClientsAfter.items.some((c) => c.id === leadId));

    // ---------- 1:many — a second proposal of a DIFFERENT type on the same lead ----------
    const boq = await convertToProposal(A, leadId, { proposalType: "BOQ Proposal" });
    created.proposalIds.push(boq.proposalId);
    check("a second proposal of a different type is created, not short-circuited", boq.already === false);
    check("it gets its own sequential number", boq.number !== number);

    const both = await prisma.proposal.findMany({ where: { leadId }, select: { id: true, proposalType: true } });
    check("the lead now carries two proposals", both.length === 2);
    check(
      "and they are of the two different types",
      new Set(both.map((p) => p.proposalType)).size === 2,
    );

    const dupSameType = await convertToProposal(A, leadId, { proposalType: "BOQ Proposal" });
    check("re-requesting the SAME type returns the existing proposal", dupSameType.already === true);
    check("…and does not mint a second number", dupSameType.proposalId === boq.proposalId);
    check(
      "no third proposal row was created",
      (await prisma.proposal.count({ where: { leadId } })) === 2,
    );

    const acts = await leadActivity(A, leadId);
    check(
      "the lead timeline shows an event for BOTH proposals",
      (acts ?? []).filter((e) => e.kind === "converted").length === 2,
    );

    // ---------- Money: WIN BOTH proposals on one lead ----------
    // This is the under-count trap the whole primaryProposal/proposalsWithOrders split
    // exists to prevent: with the old `proposals[0]` shape, a lead that won a project
    // AND its AMC would report only one order's value. Win both for real and reconcile
    // the service aggregates against a raw DB sum.
    const ltvBefore = (await clientStats(A)).lifetimeValue;

    await saveVersion(A, boq.proposalId, {
      boqItems: [
        { category: "Others", item: "Machinery estimate", unit: "Lot", qty: 1, rate: 500000, amount: 500000, aiSuggested: false },
      ],
    });
    await approveAndSend(A, boq.proposalId);

    const won1 = await markWon(A, proposalId);
    const won2 = await markWon(A, boq.proposalId);
    created.orderIds.push(won1.orderId, won2.orderId);
    check("both proposals on the same lead can be won", won1.orderId !== won2.orderId);

    const leadOrders = await prisma.order.findMany({
      where: { proposal: { leadId } },
      select: { id: true, projectValue: true, clientId: true },
    });
    check("the one lead now has TWO orders", leadOrders.length === 2);
    check(
      "both orders attach to the SAME client row (repeat-customer identity holds)",
      leadOrders[0].clientId !== null && leadOrders[0].clientId === leadOrders[1].clientId,
    );
    if (leadOrders[0].clientId) created.clientIds.push(leadOrders[0].clientId);

    const leadOrderTotal = Math.round(leadOrders.reduce((a, o) => a + Number(o.projectValue), 0));
    const ltvAfter = (await clientStats(A)).lifetimeValue;
    check(
      `clientStats LTV grew by BOTH orders, not one (+${ltvAfter - ltvBefore} vs +${leadOrderTotal})`,
      ltvAfter - ltvBefore === leadOrderTotal,
    );

    const rawTotal = Math.round(
      (
        await prisma.order.findMany({
          where: { companyId: A.companyId, deletedAt: null, proposal: { lead: { deletedAt: null } } },
          select: { projectValue: true },
        })
      ).reduce((a, o) => a + Number(o.projectValue), 0),
    );
    check(`clientStats LTV reconciles with the raw order sum (${ltvAfter} vs ${rawTotal})`, ltvAfter === rawTotal);

    const anal = await clientAnalytics(A);
    check("clientAnalytics LTV agrees with clientStats", anal.totalLifetimeValue === ltvAfter);
    const thisClient = anal.topClients.find((c) => c.name === leadRes.lead!.customerName);
    check("the client's project count is 2 — one per won proposal, not one per lead", thisClient?.projects === 2);
    check("…and their value is the sum of both", thisClient?.value === leadOrderTotal);

    const exportRows = await allClientsForExport(A);
    const thisLeadRows = exportRows.filter((r) => r.customerName === leadRes.lead!.customerName);
    check("the client export emits one row PER PROPOSAL, dropping none", thisLeadRows.length === 2);

    // ---------- Rejection carries a reason ----------
    const req2 = await createProposalRequest(E, { leadId, proposalType: "AMC Proposal" });
    created.requestIds.push(req2.id);
    let noReasonBlocked = false;
    try {
      await reviewProposalRequest(A, req2.id, "REJECTED");
    } catch {
      noReasonBlocked = true;
    }
    check("rejecting without a reason is refused", noReasonBlocked);
    await reviewProposalRequest(A, req2.id, "REJECTED", "Plant not handed over yet");
    const rejected = await prisma.proposalRequest.findUnique({ where: { id: req2.id } });
    check("rejection stores the reason for the requester", rejected?.rejectionReason === "Plant not handed over yet");

    let empReviewBlocked = false;
    try {
      await reviewProposalRequest(E, req2.id, "ACCEPTED");
    } catch {
      empReviewBlocked = true;
    }
    check("an employee cannot review requests (requireAdmin)", empReviewBlocked);

    console.log(`\n✅ verify-proposals-p6: ${pass} checks passed`);
  } finally {
    // ---------- Cleanup — leave the live DB as we found it ----------
    // Orders first — they own stages/milestones/budget/site-location rows.
    await prisma.stage.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.paymentMilestone.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.budget.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.location.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: created.orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
    await prisma.proposalOutcome.deleteMany({ where: { proposalId: { in: created.proposalIds } } });
    await prisma.contactPerson.updateMany({
      where: { clientId: { in: created.clientIds } },
      data: { clientId: null },
    });
    await prisma.client.deleteMany({ where: { id: { in: created.clientIds } } });
    await prisma.proposalRequest.deleteMany({ where: { leadId: { in: created.leadIds } } });
    await prisma.automationTask.deleteMany({
      where: { entity: "ProposalRequest", entityId: { in: created.requestIds } },
    });
    const versions = await prisma.proposalVersion.findMany({
      where: { proposalId: { in: created.proposalIds } },
      select: { id: true },
    });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: versions.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: created.proposalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: created.proposalIds } } });
    await prisma.proposal.deleteMany({ where: { id: { in: created.proposalIds } } });
    await prisma.followUp.deleteMany({ where: { leadId: { in: created.leadIds } } });
    await prisma.contactPerson.deleteMany({ where: { leadId: { in: created.leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: created.leadIds } } });
    console.log("   (test rows cleaned up)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
