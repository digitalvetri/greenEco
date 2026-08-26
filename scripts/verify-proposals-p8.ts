/**
 * Verifies Proposals P8 (Phase C) — the print templates match the client's real
 * document formats.
 *
 * Builds a Project Report and a BOQ Proposal with the sample documents' own figures,
 * renders the REAL PDFs through headless Chromium, and asserts the extracted text
 * against what those samples contain. This is the check that would catch a template
 * regression, which no unit test can: the sections only exist once rendered.
 *
 * REQUIRES the dev server running on NEXT_PUBLIC_APP_URL (same as verify-pdf.ts —
 * the renderer navigates to /print/* over HTTP). On this machine port 3000 is taken
 * by another app, so run it as:
 *     NEXT_PUBLIC_APP_URL=http://localhost:3005 npx tsx scripts/verify-proposals-p8.ts
 *
 * Requires `pdftotext` (poppler) for the text extraction.
 */
import { execFileSync } from "child_process";
import path from "path";
import { prisma } from "@/lib/prisma";
import { env, DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion } from "@/server/services/proposal";
import { generatePdf } from "@/server/services/pdf";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

function pdfText(url: string): string {
  const full = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  return execFileSync("pdftotext", ["-layout", full, "-"], { encoding: "utf8", maxBuffer: 20e6 });
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  if (env.storageDriver !== "local") throw new Error("this check reads the stored file; needs STORAGE_DRIVER=local");

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };
  const contains = (text: string, needle: string, label?: string) =>
    check(label ?? `contains "${needle}"`, text.includes(needle));

  const leadIds: string[] = [];
  const proposalIds: string[] = [];

  const mkLead = async (name: string, technology: string) => {
    const r = await createLead(A, {
      customerName: name,
      address: "Site Road, Coimbatore",
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
    // ================= Project Report (SBR), priced exactly like the sample =========
    const l1 = await mkLead(`P8 Project ${Date.now()}`, "SBR");
    const pr = await convertToProposal(A, l1, { proposalType: "Project Proposal", technology: "SBR" });
    proposalIds.push(pr.proposalId);
    await saveVersion(A, pr.proposalId, {
      documentData: { capacityCalc: { people: 500, usagePerHead: 45, factorOfSafety: 7500 } },
      boqItems: [
        { category: "Others", item: "Design and Detailed Engineering", unit: "Lot", qty: 1, rate: 50000, amount: 50000, aiSuggested: false },
        { category: "Others", item: "Mechanical Equipment's, Control Valves & Fitting Pipes", unit: "Lot", qty: 1, rate: 440000, amount: 440000, aiSuggested: false },
        { category: "Others", item: "Electrical and Instrumentation", unit: "Lot", qty: 1, rate: 220000, amount: 220000, aiSuggested: false },
        { category: "Others", item: "Erection, Commissioning & Supervisory Charges", unit: "Lot", qty: 1, rate: 70000, amount: 70000, aiSuggested: false },
      ],
      paymentTerms: [
        { description: "towards mobilization advance along with the order", percent: 60, trigger: "DATE" },
        { description: "against delivery of mechanical and electrical items", percent: 35, trigger: "STAGE_COMPLETION" },
        { description: "on successful commissioning and handover", percent: 5, trigger: "STAGE_COMPLETION" },
      ] as never,
    });

    console.log("\nRendering the Project Report …");
    const prPdf = await generatePdf(A, "proposal", pr.proposalId);
    check(`renders a real PDF (${prPdf.bytes} bytes)`, prPdf.bytes > 50_000);
    const T = pdfText(prPdf.url);
    const pages = (T.match(/\f/g) ?? []).length;
    check(`is a multi-page document (${pages} pages)`, pages >= 8);

    // ---- cover page ----
    contains(T, "Ref. No:", "cover: Ref. No line");
    contains(T, "Submitted To", "cover: Submitted To");
    contains(T, "Submitted By", "cover: Submitted By");
    contains(T, "Branch Office:", "cover: branch offices");
    contains(T, "litres per day", "cover: title names the capacity");
    contains(T, "Table of Contents", "table of contents");

    // ---- the numbered sections, in the samples' order ----
    for (const s of [
      "4. Introduction",
      "5. Sewage Treatment Plant",
      "6. Process Design of the Plant",
      "6.1 Plant Capacity Calculation",
      "6.2 The Expected Inlet Parameters",
      "6.4 Choosing the Process by Given Data",
      "6.5 Process Flow Chart",
      "6.6 Details of Process",
      "7. Civil Design",
      "8. MEP Design",
      "8.1 Machinery and Equipment",
      "8.2 Specifications of the Equipment",
      "9. Electrical Load Calculation",
      "10. Financial Proposal",
      "10.1 Quotation",
      "10.2 Taxes & Duties",
      "10.3 Payment Terms",
      "11. Supply, Erection, Commissioning and Takeover",
      "12. Warranty Details",
      "13. Scope of Work by",
      "14. Scope of Work for the Client",
      "15. Our Recent Completed Projects",
    ]) {
      contains(T, s, `section "${s}"`);
    }

    // ---- the sample's own worked numbers ----
    contains(T, "22,500", "capacity: sewage generated per day");
    contains(T, "30,000 litres per day", "capacity: total design capacity");
    check("capacity: ≈ 30 KLD", /30,000 LPD ≈ 30 KLD/.test(T));
    contains(T, "₹7,80,000", "financial: TOTAL");
    contains(T, "₹1,40,400", "financial: GST 18%");
    contains(T, "₹9,20,400", "financial: total amount");
    contains(T, "Rupees Seven Lakh Eighty Thousand Only", "financial: amount in words");
    contains(T, "Rupees Nine Lakh Twenty Thousand Four Hundred Only", "financial: words incl. GST");
    check("payment terms: 60 / 35 / 5", /60%/.test(T) && /35%/.test(T) && /5%/.test(T));

    // ---- technology-specific content actually reached the page ----
    contains(T, "SBR TANK", "flow chart: the SBR node");
    contains(T, "SLUDGE DIGESTER", "flow chart: sludge branch");
    contains(T, "CHLORINE DOSING TANK", "flow chart: dosing branch");
    contains(T, "Decanting Pump", "SBR's decanting pump in the equipment/spec tables");
    check("SBR recommendation paragraph", /So, we suggested to use the SBR technology/.test(T));
    check("MBBR's content did NOT leak in", !T.includes("MBBR TANK"));

    // ---- electrical load: the sample's exact chain ----
    check("load table: 11.6 HP running capacity", /11\.6/.test(T));
    check("load table: 1.16 HP factor of safety", /1\.16/.test(T));
    check("load table: 12.76 HP total", /12\.76/.test(T));
    check("load: ≈ 13 HP", /≈ 13 HP/.test(T));
    check("load: supply 10 kW", /= 10 kW/.test(T));

    // ---- no duplicated boilerplate (the Phase-B precedence rule, proven on paper) ----
    check("Taxes & Duties appears exactly once", (T.match(/Taxes & Duties/g) ?? []).length === 1);
    check("Points to be Noted appears exactly once", (T.match(/Points to be Noted/g) ?? []).length === 1);
    check(
      "the generic T&Cs page is suppressed (its content is in §10.2–§14)",
      !T.includes("Terms & Conditions"),
    );

    // ---- running header/footer ----
    check("running 'Page | N' footer", /Page \| 1/.test(T) && /Page \| 2/.test(T));
    contains(T, "Yours faithfully", "closing signature block");

    // ================= BOQ Proposal =================
    const l2 = await mkLead(`P8 BOQ ${Date.now()}`, "SBR");
    const bq = await convertToProposal(A, l2, { proposalType: "BOQ Proposal" });
    proposalIds.push(bq.proposalId);
    await saveVersion(A, bq.proposalId, {
      boqItems: [
        { category: "PumpsBlowers", item: "SUPPLY AND INSTALLATION OF RETURN SLUDGE PUMPS CAPACITY; 0.6HP, 3 Phase, MAKE-DHARANI / EQUIVALENT.", unit: "Set", qty: 1, rate: 42000, amount: 42000, aiSuggested: false },
        { category: "Electrical", item: "SUPPLY AND INSTALLATION OF ELECTRICAL PANEL BOARD, MAKE-MULTITECK.", unit: "Set", qty: 2, rate: 80000, amount: 160000, aiSuggested: false },
        { category: "Others", item: "SUPPLY AND USE OF BACTERIAL CULTURES FOR STABILISATION", unit: "Kg", qty: 3, rate: 5000, amount: 15000, aiSuggested: false },
      ],
    });

    console.log("\nRendering the BOQ Proposal …");
    const bqPdf = await generatePdf(A, "proposal", bq.proposalId);
    check(`renders a real PDF (${bqPdf.bytes} bytes)`, bqPdf.bytes > 50_000);
    const B = pdfText(bqPdf.url);

    contains(B, "Submitted To", "BOQ: shares the cover page");
    contains(B, "MECHANICAL, ELECTRICAL AND PLUMBING MATERIAL DETAILS", "BOQ: subtitle");
    contains(B, "LITRES PER DAY", "BOQ: all-caps estimate title");
    check("BOQ: table headings S.NO/DESCRIPTION/QTY/AMOUNT", /S\.NO/.test(B) && /DESCRIPTION/.test(B) && /QTY/.test(B) && /AMOUNT IN RS\./.test(B));
    contains(B, "TOTAL AMOUNT WITH GST", "BOQ: totals block");
    contains(B, "Authorized Signatory", "BOQ: signatory");

    // The distinguishing feature vs the Project Report: NO rate column.
    check("BOQ prints no rate column", !/\bRate\b/.test(B) && !B.includes("₹80,000\n") === !B.includes("₹80,000\n"));
    check(
      "…proven by the 2-unit line: the ₹80,000 unit rate is absent, only the ₹1,60,000 amount prints",
      B.includes("₹1,60,000") && !B.includes("₹80,000"),
    );
    check("BOQ: quantities pluralise like the sample (2 SETS / 3 KGS)", B.includes("2 SETS") && B.includes("3 KGS"));

    // Line order must be the order entered, not sorted by category.
    // `pdftotext -layout` pads cells with runs of spaces to preserve column geometry,
    // so collapse whitespace before searching or a multi-word needle won't match.
    const flat = B.replace(/\s+/g, " ");
    const order = ["RETURN SLUDGE PUMPS", "ELECTRICAL PANEL BOARD", "BACTERIAL CULTURES"].map((s) => flat.indexOf(s));
    check(
      "BOQ lines print in the order entered (not re-sorted by category)",
      order.every((i) => i > -1) && order[0] < order[1] && order[1] < order[2],
    );

    // ================= The GENERIC fallback path =================
    // Covers every proposal that existed before this work, plus Service/AMC/Others —
    // two of the four types the client asked for. It was produced by refactoring the
    // old page into a pure component, so nothing had rendered it since; tsc being
    // clean is not evidence it runs.
    // NOTE: this used to use a Service Proposal, which was the right choice while
    // Service had no format of its own. It now prints as the client's Proforma
    // Invoice (covered by verify-proposals-p10), so the fallback is exercised with
    // "Others" — the type that genuinely has no document format and, with
    // pre-types proposals, is what this path actually still serves.
    const l3 = await mkLead(`P8 Generic ${Date.now()}`, "MBBR");
    const sv = await convertToProposal(A, l3, { proposalType: "Others" });
    proposalIds.push(sv.proposalId);
    await saveVersion(A, sv.proposalId, {
      technicalText: "Quarterly preventive maintenance of the installed plant.",
      documentData: { summary: "Two visits per quarter, consumables at actuals." },
      boqItems: [
        { category: "Others", item: "Preventive maintenance visit", unit: "Nos", qty: 4, rate: 6000, amount: 24000, aiSuggested: false },
      ],
    });

    console.log("\nRendering an 'Others' proposal (generic fallback) …");
    const svPdf = await generatePdf(A, "proposal", sv.proposalId);
    check(`generic layout renders a real PDF (${svPdf.bytes} bytes)`, svPdf.bytes > 20_000);
    const S = pdfText(svPdf.url);
    contains(S, "PROPOSAL", "generic: branded PrintShell header");
    contains(S, "Preventive maintenance visit", "generic: BOQ line");
    contains(S, "Quarterly preventive maintenance", "generic: technical write-up");
    check("generic: totals present", S.includes("Grand Total") || S.includes("₹28,320"));
    check(
      "generic: does NOT use the Project Report structure",
      !S.includes("Table of Contents") && !S.includes("10.1 Quotation"),
    );

    // ---- Orphaned-content regression: everything the editor exposes must print ----
    // A Project Report must render the AI write-up, the technology explainer and the
    // project-specific scope, not just documentData. These were generated + editable
    // but unprinted when Phase C first landed.
    const l4 = await mkLead(`P8 Content ${Date.now()}`, "MBBR");
    const ct = await convertToProposal(A, l4, { proposalType: "Project Proposal", technology: "MBBR" });
    proposalIds.push(ct.proposalId);
    await saveVersion(A, ct.proposalId, {
      technicalText: "MARKER-TECHNICAL-WRITEUP for this plant.",
      scopeOfWork: { civil: "MARKER-SCOPE-CIVIL", mechanical: "MARKER-SCOPE-MECH" } as never,
      boqItems: [{ category: "Others", item: "Lump sum", unit: "Lot", qty: 1, rate: 100000, amount: 100000, aiSuggested: false }],
    });
    console.log("\nRendering a Project Report with write-up + scope …");
    const ctPdf = await generatePdf(A, "proposal", ct.proposalId);
    const C = pdfText(ctPdf.url);
    contains(C, "MARKER-TECHNICAL-WRITEUP", "prints the AI technical write-up");
    contains(C, "MARKER-SCOPE-CIVIL", "prints the project-specific scope of work");
    check("prints the technology explainer seeded for the document", /About MBBR/.test(C));
    check("MBBR flow chart node", C.includes("MBBR TANK"));

    console.log(`\n✅ verify-proposals-p8: ${pass} checks passed`);
  } finally {
    const vs = await prisma.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } }, select: { id: true } });
    await prisma.bOQItem.deleteMany({ where: { versionId: { in: vs.map((v) => v.id) } } });
    await prisma.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: proposalIds } } });
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
