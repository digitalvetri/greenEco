/**
 * Verifies the Leads P1 wave-1 (ownership + stats + urgency) against the live DB.
 * Run: npx tsx scripts/verify-leads-p1.ts
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import {
  createLead, addFollowUp, assignLead, listLeads, getLead, leadStats, leadUrgency, listCompanyUsers,
} from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("Seed the DB first (need dev-admin + dev-employee)");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) throw new Error(`FAILED: ${label}`);
    pass++;
  };

  // ---- urgency (pure) ----
  console.log("urgency engine");
  check("open lead, past next-date → overdue",
    leadUrgency({ status: "IN_FOLLOWUP", createdAt: new Date(), followUps: [{ nextDate: new Date(Date.now() - 3 * 86400000) }] })?.kind === "overdue");
  check("old NEW lead, no follow-up → stale-new",
    leadUrgency({ status: "NEW", createdAt: new Date(Date.now() - 4 * 86400000), followUps: [] })?.kind === "stale-new");
  check("converted lead → no urgency",
    leadUrgency({ status: "CONVERTED", createdAt: new Date(0), followUps: [] }) === null);

  // ---- enriched listLeads ----
  console.log("ownership enrichment");
  const created = await createLead(A, { customerName: "P1 Owner Lead", address: "1 St", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in created) || !created.lead) throw new Error("create failed");
  const leadId = created.lead.id;
  const list = await listLeads(A, { take: 100 });
  const row = list.items.find((l) => l.id === leadId);
  check("listLeads rows carry assignedToName", !!row && typeof row.assignedToName === "string" && row.assignedToName.length > 0);
  check("listLeads rows carry a urgency field", !!row && "urgency" in row);
  check("newly-created lead is owned by its creator (admin)", row?.assignedToName === admin.name);

  // ---- assignment + access transfer (the risky bit) ----
  console.log("assignment + access transfer");
  // Before reassign: employee cannot see this admin-owned lead.
  check("EMPLOYEE cannot see an admin-owned lead", (await getLead(E, leadId)) === null);
  // Admin reassigns to the employee.
  const assigned = await assignLead(A, leadId, emp.id);
  check("assignLead returns the new owner name", assigned.assignedToName === emp.name);
  check("EMPLOYEE can now see the lead reassigned to them", (await getLead(E, leadId)) !== null);
  // Reassign back to admin → employee loses access again.
  await assignLead(A, leadId, admin.id);
  check("reassigning away REMOVES the employee's access", (await getLead(E, leadId)) === null);

  // ---- assignment RBAC + validation ----
  console.log("assignment guards");
  let threw = false;
  try { await assignLead(E, leadId, emp.id); } catch { threw = true; }
  check("EMPLOYEE cannot assign (admin-only)", threw);
  threw = false;
  try { await assignLead(A, leadId, "nonexistent-user"); } catch { threw = true; }
  check("cannot assign to a non-member", threw);

  // audit row for the reassignment
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Lead", entityId: leadId, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  check("reassignment wrote an audit row", !!audit);

  // ---- stats ----
  console.log("pipeline stats");
  const s = await leadStats(A);
  check("leadStats returns the four counters", ["newCount", "dueToday", "cold", "convertedThisMonth"].every((k) => k in s));
  check("counts are non-negative numbers", [s.newCount, s.dueToday, s.cold, s.convertedThisMonth].every((n) => typeof n === "number" && n >= 0));
  // due-today should reflect a follow-up scheduled for today
  const dueBefore = (await leadStats(A)).dueToday;
  const l2 = await createLead(A, { customerName: "P1 Due Today", address: "x", phone: uniquePhone(), source: "Other" });
  if (!("lead" in l2) || !l2.lead) throw new Error("create failed");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  await addFollowUp(A, { leadId: l2.lead.id, type: "CALL", notes: "due today", outcome: "INTERESTED", nextDate: today });
  check("a follow-up due today increments dueToday", (await leadStats(A)).dueToday === dueBefore + 1);

  // ---- company users ----
  const members = await listCompanyUsers(A);
  check("listCompanyUsers returns active members", members.length >= 2 && members.every((m) => "name" in m));

  console.log(`\n✅ Leads P1 wave-1 verified — ${pass} checks passed`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
