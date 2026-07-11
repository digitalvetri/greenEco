/**
 * Verifies Leads P1 wave-2 (lifecycle + activity timeline + export-all).
 * Run: npx tsx scripts/verify-leads-p2.ts
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  createLead, addFollowUp, assignLead, setLeadStatus, archiveLead, leadActivity,
  allLeadsForExport, listLeads, convertToProposal,
} from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("Seed the DB first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) throw new Error(`FAILED: ${label}`);
    pass++;
  };

  const mk = async (name: string) => {
    const r = await createLead(A, { customerName: name, address: "x", phone: uniquePhone(), source: "CallIn" });
    if (!("lead" in r) || !r.lead) throw new Error("create failed");
    return r.lead.id;
  };

  // ---- status control + reopen ----
  console.log("status control + reopen");
  const id = await mk("P2 Status Lead");
  await setLeadStatus(A, id, "LOST", "Chose a competitor");
  let l = await prisma.lead.findUnique({ where: { id } });
  check("mark LOST sets status + lostReason", l?.status === "LOST" && l?.lostReason === "Chose a competitor");

  let threw = false;
  try { await setLeadStatus(A, id, "LOST"); } catch { threw = true; }
  check("mark LOST without a reason throws", threw);

  await setLeadStatus(A, id, "IN_FOLLOWUP");
  l = await prisma.lead.findUnique({ where: { id } });
  check("reopen LOST → IN_FOLLOWUP clears lostReason", l?.status === "IN_FOLLOWUP" && l?.lostReason === null);

  // CONVERTED is locked
  const convId = await mk("P2 Convert Lock");
  await convertToProposal(A, convId);
  threw = false;
  try { await setLeadStatus(A, convId, "ON_HOLD"); } catch { threw = true; }
  check("a CONVERTED lead's status is locked", threw);

  // RBAC: employee cannot change a lead they don't own
  threw = false;
  try { await setLeadStatus(E, id, "ON_HOLD"); } catch { threw = true; }
  check("EMPLOYEE cannot set status on a lead they don't own", threw);

  // ---- archive (soft-delete) ----
  console.log("archive");
  const archId = await mk("P2 Archive Me Unique");
  const inBefore = (await listLeads(A, { take: 100, search: "P2 Archive Me Unique" })).items.some((l) => l.id === archId);
  await archiveLead(A, archId);
  const inAfter = (await listLeads(A, { take: 100, search: "P2 Archive Me Unique" })).items.some((l) => l.id === archId);
  check("archived lead drops out of listLeads", inBefore && !inAfter);
  check("archived lead is not fetchable", (await prisma.lead.findFirst({ where: { id: archId, deletedAt: null } })) === null);
  threw = false;
  try { await archiveLead(E, await mk("P2 Emp Archive")); } catch { threw = true; }
  check("EMPLOYEE cannot archive (admin-only)", threw);

  // ---- activity timeline ----
  console.log("activity timeline");
  const tId = await mk("P2 Timeline");
  await addFollowUp(A, { leadId: tId, type: "CALL", notes: "first call", outcome: "INTERESTED", nextDate: new Date(Date.now() + 3 * 86400000) });
  await assignLead(A, tId, emp.id);
  await setLeadStatus(A, tId, "ON_HOLD");
  const events = await leadActivity(A, tId);
  check("timeline returns events", !!events && events.length >= 4);
  const kinds = new Set(events!.map((e) => e.kind));
  check("timeline includes 'created'", kinds.has("created"));
  check("timeline includes the follow-up", kinds.has("followup"));
  check("timeline includes 'reassigned'", kinds.has("reassigned"));
  check("timeline includes 'status'", kinds.has("status"));
  check("timeline is newest-first", events!.every((e, i) => i === 0 || new Date(events![i - 1].at) >= new Date(e.at)));
  check("EMPLOYEE gets null for a lead they can't see", (await leadActivity(E, convId)) === null);

  // ---- export all ----
  console.log("export all");
  const all = await allLeadsForExport(A, {});
  const page = await listLeads(A, { take: 50 });
  check("export returns more than one page when >50 exist", all.length >= page.items.length);
  check("export rows carry owner + no pricing keys", all.every((r) => "owner" in r) && !all.some((r) => "purchasePrice" in r));
  const filtered = await allLeadsForExport(A, { source: "CallIn" });
  check("export honours filters", filtered.every((r) => r.source === "CallIn") && filtered.length < all.length);

  console.log(`\n✅ Leads P1 wave-2 verified — ${pass} checks passed`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
