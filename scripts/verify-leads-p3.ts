/**
 * Verifies Leads P2 domain fields (sizing + water quality + score + BOQ preview
 * + conversion wiring). Run: npx tsx scripts/verify-leads-p3.ts
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, updateLead, getLead, convertToProposal } from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("Seed the DB first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) throw new Error(`FAILED: ${label}`);
    pass++;
  };

  // ---- persistence ----
  console.log("structured fields persist");
  const r = await createLead(A, {
    customerName: "P3 Sizing Lead", address: "Coimbatore", phone: uniquePhone(), source: "Consultant",
    plantType: "ETP", technology: "SBR", capacityKLD: 120, segment: "Textile",
    budgetBand: "Above ₹1Cr", decisionTimeline: "Immediate (<1 mo)",
    inletBOD: 350, inletCOD: 900, inletTSS: 400, inletTDS: 2100,
  });
  if (!("lead" in r) || !r.lead) throw new Error("create failed");
  const id = r.lead.id;
  const row = await prisma.lead.findUnique({ where: { id } });
  check("plantType/technology/capacityKLD persisted", row?.plantType === "ETP" && row?.technology === "SBR" && row?.capacityKLD === 120);
  check("segment/budget/timeline persisted", row?.segment === "Textile" && row?.budgetBand === "Above ₹1Cr");
  check("inlet water quality persisted", row?.inletBOD === 350 && row?.inletCOD === 900 && row?.inletTSS === 400 && row?.inletTDS === 2100);

  // ---- score + preview on getLead ----
  console.log("score + BOQ preview");
  const full = await getLead(A, id);
  check("getLead returns a temperature", !!full && full.score.temperature === "HOT");
  check("getLead returns a BOQ preview band", !!full?.boqPreview && full.boqPreview.band === 100);
  check("BOQ preview is a low/mid/high band", !!full?.boqPreview && full.boqPreview.low < full.boqPreview.mid && full.boqPreview.mid < full.boqPreview.high);

  // ---- update ----
  console.log("update");
  await updateLead(A, id, {
    customerName: "P3 Sizing Lead", address: "Coimbatore", phone: row!.phone, source: "Consultant",
    plantType: "STP", technology: "MBBR", capacityKLD: 20,
  });
  const updated = await prisma.lead.findUnique({ where: { id } });
  check("update changes sizing fields", updated?.plantType === "STP" && updated?.capacityKLD === 20);

  // ---- conversion carries the sizing ----
  console.log("conversion wiring");
  const conv = await convertToProposal(A, id);
  const prop = await prisma.proposal.findUnique({ where: { id: conv.proposalId } });
  check("proposal inherits the lead's plantType/technology/capacityKLD", prop?.plantType === "STP" && prop?.technology === "MBBR" && prop?.capacityKLD === 20);

  // ---- THE CRITICAL TEST: convert a lead with NULL sizing must not crash ----
  console.log("legacy lead (null sizing) conversion");
  const bare = await createLead(A, { customerName: "P3 Bare Lead", address: "x", phone: uniquePhone(), source: "Other" });
  if (!("lead" in bare) || !bare.lead) throw new Error("create failed");
  const bareRow = await prisma.lead.findUnique({ where: { id: bare.lead.id } });
  check("bare lead has NULL sizing (pre-P2 shape)", bareRow?.plantType === null && bareRow?.capacityKLD === null);
  const bareConv = await convertToProposal(A, bare.lead.id);
  const bareProp = await prisma.proposal.findUnique({ where: { id: bareConv.proposalId } });
  check("converting a null-sizing lead coalesces to STP/MBBR/0 (no crash)", bareProp?.plantType === "STP" && bareProp?.technology === "MBBR" && bareProp?.capacityKLD === 0);

  // ---- score is not pricing (visible regardless of role) ----
  console.log("score is role-agnostic (not pricing)");
  const bareFull = await getLead(A, bare.lead.id);
  check("a bare lead scores COLD/WARM (low)", !!bareFull && bareFull.score.temperature !== "HOT");

  console.log(`\n✅ Leads P2 domain fields verified — ${pass} checks passed`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
