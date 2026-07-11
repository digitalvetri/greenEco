/**
 * Verifies the three Leads P0 fixes against the live DB (idempotent-ish;
 * appends test rows). Run: npx tsx scripts/verify-leads-p0.ts
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, addFollowUp, updateLead, listLeads } from "@/server/services/lead";

function uniquePhone() {
  return "9" + String(Date.now()).slice(-9);
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("Seed the DB first");
  const ctx = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) throw new Error(`FAILED: ${label}`);
    pass++;
  };

  // ---- P0-2: QUOTE_REQUESTED is reachable ----
  console.log("P0-2 · QUOTE_REQUESTED reachability");
  const r1 = await createLead(ctx, {
    customerName: "P0 Price Lead", address: "1 Test St", phone: uniquePhone(), source: "CallIn",
  });
  if (!("lead" in r1) || !r1.lead) throw new Error("createLead returned duplicate");
  const leadId = r1.lead.id;
  check("new lead starts NEW", r1.lead.status === "NEW");

  await addFollowUp(ctx, {
    leadId, type: "CALL", notes: "Asked for pricing",
    outcome: "PRICE_DISCUSSION", nextDate: new Date(Date.now() + 3 * 86400000),
  });
  const afterPrice = await prisma.lead.findUnique({ where: { id: leadId } });
  check("PRICE_DISCUSSION follow-up advances to QUOTE_REQUESTED", afterPrice?.status === "QUOTE_REQUESTED");

  // forward-only: a routine follow-up must NOT regress it
  await addFollowUp(ctx, {
    leadId, type: "CALL", notes: "Routine check-in",
    outcome: "NEEDS_TIME", nextDate: new Date(Date.now() + 5 * 86400000),
  });
  const afterRoutine = await prisma.lead.findUnique({ where: { id: leadId } });
  check("later routine follow-up does NOT regress QUOTE_REQUESTED", afterRoutine?.status === "QUOTE_REQUESTED");

  // it appears under the QUOTE_REQUESTED filter (the tab that was always empty)
  const quoteList = await listLeads(ctx, { status: "QUOTE_REQUESTED", take: 100 });
  check("lead appears under the QUOTE_REQUESTED filter", quoteList.items.some((l) => l.id === leadId));

  // ---- P0-3: lead editing ----
  console.log("P0-3 · lead editing");
  const r2 = await createLead(ctx, {
    customerName: "P0 Edit Lead", address: "wrong addr", phone: uniquePhone(), source: "Reference",
  });
  if (!("lead" in r2) || !r2.lead) throw new Error("createLead returned duplicate");
  const editId = r2.lead.id;
  const newPhone = uniquePhone();
  const upd = await updateLead(ctx, editId, {
    customerName: "P0 Edit Lead (fixed)", address: "42 Correct Ave", phone: newPhone,
    source: "Builder",
  });
  check("updateLead returns the lead", "lead" in upd);
  const edited = await prisma.lead.findUnique({ where: { id: editId } });
  check("name persisted", edited?.customerName === "P0 Edit Lead (fixed)");
  check("address persisted", edited?.address === "42 Correct Ave");
  check("phone persisted", edited?.phone === newPhone);
  check("source persisted", edited?.source === "Builder");

  // dedup-on-edit: changing phone to an existing lead's phone (excluding self) → duplicate
  const dupTarget = await createLead(ctx, {
    customerName: "P0 Dup Target", address: "x", phone: uniquePhone(), source: "Other",
  });
  if (!("lead" in dupTarget) || !dupTarget.lead) throw new Error("setup dup target failed");
  const collide = await updateLead(ctx, editId, {
    customerName: "P0 Edit Lead (fixed)", address: "42 Correct Ave",
    phone: dupTarget.lead.phone, source: "Builder",
  });
  check("editing phone to a collision returns { duplicate }", "duplicate" in collide);
  const collideOverride = await updateLead(ctx, editId, {
    customerName: "P0 Edit Lead (fixed)", address: "42 Correct Ave",
    phone: dupTarget.lead.phone, source: "Builder", overrideDuplicate: true,
  });
  check("override forces the edit through", "lead" in collideOverride);
  // re-editing to its OWN current phone must NOT self-collide
  const selfSame = await updateLead(ctx, editId, {
    customerName: "P0 Edit Lead (fixed)", address: "42 Correct Ave",
    phone: dupTarget.lead.phone, source: "Builder",
  });
  check("re-saving with unchanged phone does not self-collide", "lead" in selfSame);

  // audit row written
  const audit = await prisma.auditLog.findFirst({
    where: { entity: "Lead", entityId: editId, action: "UPDATE" }, orderBy: { createdAt: "desc" },
  });
  check("an UPDATE Lead audit row was written", !!audit);

  // ---- P0-1: cursor pagination ----
  console.log("P0-1 · pagination");
  const page1 = await listLeads(ctx, { take: 1 });
  check("page 1 returns a nextCursor when more exist", page1.items.length === 1 && page1.nextCursor !== null);
  const page2 = await listLeads(ctx, { take: 1, cursor: page1.nextCursor! });
  check("page 2 (via cursor) returns a different lead", page2.items.length >= 1 && page2.items[0].id !== page1.items[0].id);

  console.log(`\n✅ Leads P0 verified — ${pass} checks passed`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
