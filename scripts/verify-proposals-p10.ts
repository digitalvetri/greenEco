/**
 * Renders the AMC Quotation and the Service Proforma through the REAL PDF pipeline
 * and reads the generated files back, the way v46 caught the BOQ line-ordering bug —
 * types and unit tests cannot tell you a document printed the wrong thing.
 *
 * REQUIRES a dev server on NEXT_PUBLIC_APP_URL (the headless renderer navigates to
 * /print/*) and `pdftotext` (poppler). On this machine port 3000 belongs to another
 * app, so:  NEXT_PUBLIC_APP_URL=http://localhost:3007 npx tsx scripts/verify-proposals-p10.ts
 */
import { execFileSync } from "child_process";
import path from "path";
import { prisma } from "@/lib/prisma";
import { env, DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion } from "@/server/services/proposal";
import { generatePdf } from "@/server/services/pdf";
import { getCompanySettings } from "@/server/services/company-settings";
import { amountInWords } from "@/lib/money";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

function pdfText(url: string): string {
  const full = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  return execFileSync("pdftotext", ["-layout", full, "-"], { encoding: "utf8", maxBuffer: 20e6 });
}
const squash = (s: string) => s.replace(/\s+/g, " ");

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId, capabilities: admin.capabilities };
  if (env.storageDriver !== "local") throw new Error("this check reads the stored file; needs STORAGE_DRIVER=local");

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];

  async function make(name: string, type: string) {
    const r = await createLead(A, {
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
    const { proposalId } = await convertToProposal(A, r.lead.id, { proposalType: type });
    proposalIds.push(proposalId);
    return proposalId;
  }

  try {
    // ================= AMC Quotation =================
    const amcId = await make(`AMC Print Co ${Date.now()}`, "AMC Proposal");
    await saveVersion(A, amcId, {
      boqItems: [
        ["Operating cost for the operators (3 shifts)", 75000],
        ["Consumables required to run the plant smoothly", 10000],
        ["Machinery and equipment maintenance with spares", 65000],
        ["Monthly engineer visit; raw and treated water testing", 25000],
      ].map(([item, rate]) => ({
        category: "Others",
        item: item as string,
        unit: "Month",
        qty: 12,
        rate: rate as number,
        amount: (rate as number) * 12,
        aiSuggested: false,
      })),
      documentData: {
        termMonths: 12,
        additionalPlants: [
          { plantType: "ETP", capacityValue: 100, capacityUnit: "KLD", units: ["Bar Screen Chamber", "pH Correction Tank"] },
        ],
      },
    });

    const amcPdf = await generatePdf(A, "proposal", amcId);
    check(`AMC PDF generated (${amcPdf.url})`, !!amcPdf.url);
    const amc = squash(pdfText(amcPdf.url));

    check("titled as an Annual Maintenance Contract proposal", /Proposal of Annual Maintenance Contract/i.test(amc));
    check("…naming BOTH plants on one contract", /STP \(Capacity 1000 KLD\) and ETP \(Capacity 100 KLD\)/i.test(amc));
    // `pdftotext -layout` interleaves a multi-line table header across its columns
    // ("PER … MONTH … CHARGES" lands in three separate runs), so assert the tokens,
    // not the phrase — the same extraction quirk p8 documents for the BOQ table.
    check("the charge table's own headings print", /SL\.NO/i.test(amc) && /DESCRIPTION OF WORK/i.test(amc) && /CHARGES/i.test(amc));
    check("…including the months column the BOQ format has no equivalent of", /MONTHS/i.test(amc) && /12 Month/i.test(amc));
    check("the sample's per-month figure prints", /75,000/.test(amc));
    check("…the yearly line total", /9,00,000/.test(amc));
    check("…the sub total", /21,00,000/.test(amc));
    check("…the GST", /3,78,000/.test(amc));
    check("…the grand total", /24,78,000/.test(amc));
    // The words sit in the table's left cell and wrap, so extraction interleaves them
    // with the "TOTAL AMOUNT WITH 18% GST" cell beside them. Assert both halves.
    check(
      "…and the amount in words",
      /RUPEES TWENTY FOUR LAKH SEVENTY EIGHT/i.test(amc) && /THOUSAND ONLY/i.test(amc),
    );
    check("the rates-validity line prints", /above rates are for 1 year only/i.test(amc));
    check("the SBR process write-up is reused, not re-authored", /Stage 1 . Filling/i.test(amc) || /Filling/i.test(amc));
    check("…through to its last stage", /Sludge Wasting/i.test(amc));
    check("the units section lists the primary plant's tanks", /SBR Tank/i.test(amc));
    check(
      "…and does NOT list the process write-up as if it were a tank",
      !/SBR Tank SBR Treatment Process/i.test(amc),
    );
    check("…and the second plant's own units", /pH Correction Tank/i.test(amc));
    check("the machinery list prints", /Machinery & Equipment used|Machinery and Equipment/i.test(amc));
    check("the client's numbered scope notes print", /All spares cost included in this offer/i.test(amc));
    check("…through to the last one", /Pollution Control Board/i.test(amc));
    // The running header is the CONFIGURED company name, not the sample's literal
    // "Green Ecocare Private Limited" — so assert against Settings, or this passes
    // or fails for the wrong reason on any other company.
    const settings = await getCompanySettings(A.companyId);
    check(
      `the running letterhead is the configured company name ("${settings.name}")`,
      amc.includes(settings.name),
    );
    check("…with page numbering", /Page \| 1/.test(amc));

    // ================= Service Proforma =================
    const svcId = await make(`Service Print Co ${Date.now()}`, "Service Proposal");
    await saveVersion(A, svcId, {
      validityDays: 45,
      boqItems: [
        { category: "Others", item: "Collection Pump No: 2 Service (3 HP Submersible Sewage Pump Rewinding)", unit: "No", qty: 1, rate: 12000, amount: 12000, aiSuggested: false },
        { category: "Others", item: "Level Sensor Probes", unit: "No", qty: 15, rate: 1400, amount: 21000, aiSuggested: false },
      ],
      documentData: { jobDescription: "Pump servicing", priority: "HIGH" },
    });
    const svcPdf = await generatePdf(A, "proposal", svcId);
    const svc = squash(pdfText(svcPdf.url));

    check("Service prints as a Proforma Invoice, not a proposal cover page", /Proforma Invoice/i.test(svc));
    check("…with a Quotation No and Date", /Quotation No/i.test(svc) && /Date/i.test(svc));
    check("…addressed with a To. block", /To\./.test(svc));
    // "Rate per / Quantity" is a two-line header; extraction splits it.
    check("its table HAS a rate column (the opposite of the BOQ format)", /Rate per/i.test(svc));
    check("…and quantities read like the sample", /15 Nos/.test(svc));
    check("rate and total both print", /12,000/.test(svc) && /21,000/.test(svc));
    check("Grand Total prints", /Grand Total/i.test(svc));
    // 12,000 + 21,000 = 33,000 + 18% = 38,940. Derived, not a hardcoded string, so a
    // change to the fixture can't silently make this assert the wrong number.
    check("…with the amount in words", new RegExp(amountInWords(38940), "i").test(svc));
    check("the declaration uses the proposal's own validity, not a hardcoded 45", /valid for 45 days only/i.test(svc));
    check("…and the signature block", /Authorized Signatory/i.test(svc));
    check("GSTIN prints on this format's letterhead", /GSTIN/i.test(svc));
    check(
      "the one-page proforma does NOT get the running header (it has its own)",
      (svc.match(new RegExp(settings.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length <= 2,
    );

    // ================= The generic fallback still runs =================
    const otherId = await make(`Other Print Co ${Date.now()}`, "Others");
    await saveVersion(A, otherId, {
      boqItems: [{ category: "Others", item: "Consultancy", unit: "Lot", qty: 1, rate: 50000, amount: 50000, aiSuggested: false }],
    });
    const otherPdf = await generatePdf(A, "proposal", otherId);
    const other = squash(pdfText(otherPdf.url));
    check("a type with no format of its own still prints through the generic layout", /PROPOSAL/i.test(other));
    check("…with its money intact", /50,000/.test(other));

    console.log(`\n✅ verify-proposals-p10: ${pass} checks passed`);
  } finally {
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...proposalIds, ...leadIds] } } });
    await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
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
