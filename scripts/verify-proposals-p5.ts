/** Verifies Proposals P5 (client corrections phase 2 — richer proposal content):
 *  convertToProposal seeds terms from Company.standardTermsTemplate, saveVersion persists
 *  the new coverLetter/pointsToNote/technologyExplainer/technicalSpecs/electricalLoad/terms
 *  fields, and generateTermsDraft degrades cleanly (no AI key here) to the template. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { getCompanySettings } from "@/server/services/company-settings";
import { saveVersion, getProposal, generateTermsDraft } from "@/server/services/proposal";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const { standardTermsTemplate } = await getCompanySettings(A.companyId);
  check("standardTermsTemplate is non-empty", standardTermsTemplate.length > 100);

  const lead = await createLead(A, { customerName: "P5 Richness", address: "9 Rd, Coimbatore", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in lead) || !lead.lead) throw new Error("lead failed");
  const pid = (await convertToProposal(A, lead.lead.id)).proposalId;

  const seeded = await getProposal(A, pid);
  const seededV = (seeded as { versions: Array<{ terms: unknown }> }).versions[0];
  check("new proposal's terms seeded from the standard template", seededV.terms === standardTermsTemplate);

  const technicalSpecs = [{ section: "Mechanical", item: "Aeration Blower", spec: "3 HP, IP55", qty: "2 Nos" }];
  const electricalLoad = [{ description: "Aeration Blower", hp: 6 }];
  await saveVersion(A, pid, {
    boqItems: [{ category: "Civil", item: "Tank", unit: "cum", qty: 10, rate: 10000, amount: 100000, aiSuggested: false }],
    coverLetter: "Dear Sir, thank you for the opportunity...",
    pointsToNote: "GST extra\nCivil work by client",
    technologyExplainer: "MBBR uses moving bio-media...",
    technicalSpecs: technicalSpecs as never,
    electricalLoad: electricalLoad as never,
    terms: "Custom T&Cs for this deal.",
  });

  const full = await getProposal(A, pid);
  const v = (full as {
    versions: Array<{
      coverLetter: string | null; pointsToNote: string | null; technologyExplainer: string | null;
      technicalSpecs: unknown; electricalLoad: unknown; terms: unknown;
    }>;
  }).versions[0];
  check("coverLetter persisted", v.coverLetter === "Dear Sir, thank you for the opportunity...");
  check("pointsToNote persisted", v.pointsToNote === "GST extra\nCivil work by client");
  check("technologyExplainer persisted", v.technologyExplainer === "MBBR uses moving bio-media...");
  check("technicalSpecs persisted (1 line)", Array.isArray(v.technicalSpecs) && (v.technicalSpecs as unknown[]).length === 1);
  check("electricalLoad persisted (1 line)", Array.isArray(v.electricalLoad) && (v.electricalLoad as unknown[]).length === 1);
  check("terms overwritten with the custom text", v.terms === "Custom T&Cs for this deal.");

  // No AI provider configured in this environment — generateTermsDraft must degrade to
  // the template, never throw, never blank the field.
  const draft = await generateTermsDraft(A, pid);
  check("generateTermsDraft degrades to template with no AI key", draft.source === "template" && draft.text === standardTermsTemplate);

  console.log(`\n✅ Proposals P5 (richer AI-generated content) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
