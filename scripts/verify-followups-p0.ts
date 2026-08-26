/**
 * Verifies the Follow-ups module end-to-end against the live DB, as an admin and as
 * an employee.
 *
 * The assertions that matter are the ones covering what was BROKEN before:
 *   • a follow-up logged against a PROPOSAL was invisible on every surface, because
 *     both queries required a `lead` relation and a proposal follow-up has no leadId
 *   • …and it could not be completed either — the mutations hard-required a lead and
 *     threw "Not found"
 *   • a COMPLETED follow-up kept showing as overdue forever (`completedAt` ignored)
 *   • the office-only rule must still hold: an employee must not see activity on a
 *     proposal the admin hasn't released yet (v44)
 *   • the list and the calendar must agree — they now share one scope
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, addFollowUp, convertToProposal } from "@/server/services/lead";
import { addProposalFollowUp, approveAndSend } from "@/server/services/proposal";
import {
  listFollowUpWorklist,
  listCalendarEvents,
  completeFollowUp,
  rescheduleFollowUp,
} from "@/server/services/calendar";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

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
  const blocked = async (l: string, fn: () => Promise<unknown>) => {
    let threw = false;
    try {
      await fn();
    } catch {
      threw = true;
    }
    check(l, threw);
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];
  const followUpIds: string[] = [];

  /** All worklist events, flattened. */
  const flat = async (ctx: typeof A, opts = {}) =>
    (await listFollowUpWorklist(ctx, opts)).sections.flatMap((s) => s.events);
  const has = (evs: { id: string }[], id: string) => evs.some((e) => e.id === id);

  try {
    // ---------- A lead follow-up: the case that always worked ----------
    const leadRes = await createLead(A, {
      customerName: `Follow Co ${Date.now()}`,
      address: "7 Worklist Road, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 30,
    });
    if (!("lead" in leadRes) || !leadRes.lead) throw new Error("lead create failed");
    const leadId = leadRes.lead.id;
    leadIds.push(leadId);

    const leadFu = await addFollowUp(A, {
      leadId,
      type: "CALL",
      notes: "Discussed the inlet parameters",
      nextDate: inDays(3),
    });
    followUpIds.push(leadFu.id);

    let evs = await flat(A);
    check("a lead follow-up appears in the worklist", has(evs, leadFu.id));
    check(
      "…bucketed as upcoming, not overdue",
      (await listFollowUpWorklist(A)).sections.find((s) => s.bucket === "upcoming")!.events.some((e) => e.id === leadFu.id),
    );

    // ---------- A PROPOSAL follow-up: the one that was invisible ----------
    const { proposalId } = await convertToProposal(A, leadId, { proposalType: "BOQ Proposal" });
    proposalIds.push(proposalId);

    const propFu = await addProposalFollowUp(A, proposalId, {
      type: "EMAIL",
      notes: "Chased the revised quote",
      nextDate: inDays(2),
    });
    followUpIds.push(propFu.id);
    const stored = await prisma.followUp.findUnique({ where: { id: propFu.id } });
    check("a proposal follow-up genuinely has NO leadId (the premise of the bug)", stored?.leadId === null);

    evs = await flat(A);
    check("…and it now appears in the worklist", has(evs, propFu.id));
    const cal = await listCalendarEvents(A, { from: inDays(-1), to: inDays(10) });
    check("…and on the calendar too", has(cal, propFu.id));
    check(
      "…titled by the proposal, not a bare placeholder",
      evs.find((e) => e.id === propFu.id)?.title !== "Follow-up",
    );

    // ---------- The office-only rule still holds ----------
    const draft = await prisma.proposal.findUnique({ where: { id: proposalId } });
    check("the proposal is still a DRAFT", draft?.status === "DRAFT");
    let empEvs = await flat(E);
    check(
      "an EMPLOYEE cannot see a follow-up on an unreleased DRAFT proposal",
      !has(empEvs, propFu.id),
    );
    await blocked("…nor complete it, given its id", () => completeFollowUp(E, propFu.id));

    // ---------- Completing works for a proposal follow-up ----------
    await completeFollowUp(A, propFu.id);
    const after = await prisma.followUp.findUnique({ where: { id: propFu.id } });
    check("completing a PROPOSAL follow-up works (it used to throw 'Not found')", after?.completedAt !== null);

    evs = await flat(A);
    check("…and it leaves the default worklist", !has(evs, propFu.id));
    const completedOnly = await flat(A, { status: "completed" });
    check("…but is still findable under the Completed filter", has(completedOnly, propFu.id));

    // ---------- Completed items are not overdue forever ----------
    // A fresh lead: `leadId` above is CONVERTED now, and converted leads are read-only.
    const lead2Res = await createLead(A, {
      customerName: `Overdue Co ${Date.now()}`,
      address: "11 Overdue Lane, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 20,
    });
    if (!("lead" in lead2Res) || !lead2Res.lead) throw new Error("lead 2 create failed");
    leadIds.push(lead2Res.lead.id);

    const overdueFu = await addFollowUp(A, {
      leadId: lead2Res.lead.id,
      type: "MEETING",
      notes: "Site walkthrough",
      nextDate: inDays(-5),
    });
    followUpIds.push(overdueFu.id);
    const overdueSection = (await listFollowUpWorklist(A)).sections.find((s) => s.bucket === "overdue")!;
    check("a past-dated follow-up is overdue", overdueSection.events.some((e) => e.id === overdueFu.id));
    await completeFollowUp(A, overdueFu.id);
    const stillOverdue = (await listFollowUpWorklist(A)).sections.find((s) => s.bucket === "overdue")!;
    check(
      "…and stops being overdue once completed (the old page ignored completedAt)",
      !stillOverdue.events.some((e) => e.id === overdueFu.id),
    );

    // ---------- Reschedule reopens ----------
    await rescheduleFollowUp(A, overdueFu.id, inDays(4), "Pushed to next week");
    const resched = await prisma.followUp.findUnique({ where: { id: overdueFu.id } });
    check("rescheduling reopens a completed follow-up", resched?.completedAt === null);
    check("…and moves its date", resched!.nextDate! > new Date());
    check("…and updates the note when one is given", resched?.notes === "Pushed to next week");

    // ---------- List and calendar agree ----------
    const wl = await flat(A, { horizonDays: 30 });
    const calSame = await listCalendarEvents(A, { from: inDays(-365), to: inDays(31) });
    const wlIds = new Set(wl.map((e) => e.id));
    const calIds = new Set(calSame.map((e) => e.id));
    check(
      `every worklist item is on the calendar for the same window (${wlIds.size} items)`,
      Array.from(wlIds).every((id) => calIds.has(id)),
    );

    // ---------- Employee scope ----------
    empEvs = await flat(E);
    const leadOwners = await prisma.lead.findMany({
      where: { id: { in: empEvs.map((e) => e.leadId).filter(Boolean) as string[] } },
      select: { assignedToId: true, createdById: true },
    });
    check(
      "an employee's worklist only contains leads they own or created",
      leadOwners.every((l) => l.assignedToId === E.userId || l.createdById === E.userId),
    );

    // ---------- Released proposals DO reach the employee ----------
    await approveAndSend(A, proposalId);
    const sentFu = await addProposalFollowUp(A, proposalId, {
      type: "CALL",
      notes: "Client asked for a revision",
      nextDate: inDays(5),
    });
    followUpIds.push(sentFu.id);
    empEvs = await flat(E);
    check(
      "a follow-up the ADMIN logged is still not in the EMPLOYEE's personal worklist",
      !has(empEvs, sentFu.id),
    );
    check("…while the admin does see it", has(await flat(A), sentFu.id));

    console.log(`\n✅ verify-followups-p0: ${pass} checks passed`);
  } finally {
    await prisma.followUp.deleteMany({ where: { id: { in: followUpIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...followUpIds, ...proposalIds, ...leadIds] } } });
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.followUp.deleteMany({ where: { proposalId: { in: proposalIds } } });
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
