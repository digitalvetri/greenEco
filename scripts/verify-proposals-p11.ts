/**
 * Verifies the two things v57 added: the contents page's PAGE NUMBERS, and the Word
 * download.
 *
 * The TOC numbers are the point of the measurement pass — they must match the running
 * footer, or a reader who looks up "10" and turns to the page whose footer says
 * "Page | 10" lands somewhere else. Asserted by reading the generated PDF's own pages.
 *
 * REQUIRES a dev server on NEXT_PUBLIC_APP_URL plus `pdftotext`:
 *   NEXT_PUBLIC_APP_URL=http://localhost:3007 npx tsx scripts/verify-proposals-p11.ts
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { env, DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion } from "@/server/services/proposal";
import { generatePdf, generateDocx } from "@/server/services/pdf";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);
const localPath = (url: string) => path.join(process.cwd(), "public", url.replace(/^\//, ""));
const pdfText = (url: string, args: string[] = []) =>
  execFileSync("pdftotext", ["-layout", ...args, localPath(url), "-"], { encoding: "utf8", maxBuffer: 20e6 });

/** Text of one page of a PDF (1-based), so a TOC entry can be checked against it. */
const pageText = (url: string, page: number) => pdfText(url, ["-f", String(page), "-l", String(page)]);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId, capabilities: admin.capabilities };
  if (env.storageDriver !== "local") throw new Error("reads the stored file; needs STORAGE_DRIVER=local");

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const leadIds: string[] = [];
  const proposalIds: string[] = [];

  try {
    const r = await createLead(A, {
      customerName: `TOC & Word ${Date.now()}`,
      address: "Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 30,
    });
    if (!("lead" in r) || !r.lead) throw new Error("lead create failed");
    leadIds.push(r.lead.id);
    const { proposalId } = await convertToProposal(A, r.lead.id, {
      proposalType: "Project Proposal",
      technology: "MBBR",
    });
    proposalIds.push(proposalId);
    await saveVersion(A, proposalId, {
      documentData: { capacityCalc: { people: 500, usagePerHead: 45, factorOfSafety: 7500 } },
      boqItems: [
        ["Design and Detailed Engineering", 50000],
        ["Mechanical Equipment's, Control Valves & Fitting Pipes", 440000],
        ["Electrical and Instrumentation", 220000],
        ["Erection, Commissioning & Supervisory Charges", 70000],
      ].map(([item, amt]) => ({
        category: "Others",
        item: item as string,
        unit: "Lot",
        qty: 1,
        rate: amt as number,
        amount: amt as number,
        aiSuggested: false,
      })),
    });

    // ================= Table of contents page numbers =================
    const pdf = await generatePdf(A, "proposal", proposalId);
    const all = pdfText(pdf.url);
    const toc = /Cover Letter([\s\S]*?)Recent Completed/.exec(all)?.[0] ?? "";
    check("the contents page renders", toc.length > 0);

    // Every entry except the cover carries a number; the cover is deliberately blank.
    const rows = toc
      .split("\n")
      .map((l) => /^\s*(\d+)\.\s+(.+?)\s{2,}(\d+)\s*$/.exec(l.trimEnd()))
      .filter(Boolean) as RegExpExecArray[];
    check(`entries carry page numbers (${rows.length} numbered rows)`, rows.length >= 13);
    check(
      "…the Cover Letter row is deliberately NOT numbered (the cover has no page number)",
      !/^\s*1\.\s+Cover Letter\s{2,}\d/m.test(toc),
    );
    check("…and they ascend", rows.every((m, i, a) => i === 0 || Number(m[3]) >= Number(a[i - 1][3])));

    // THE assertion: a TOC number must land on the page whose FOOTER says the same.
    const spot = rows.filter((m) => /Financial Proposal|Civil Design|Electrical Load/.test(m[2]));
    check(`spot-checking ${spot.length} sections against the real pages`, spot.length >= 2);
    for (const m of spot) {
      const claimed = Number(m[3]);
      // +1: the cover is page 1 of the file but carries no printed number, so the
      // page whose footer reads "Page | N" is the (N+1)th page of the PDF.
      const txt = pageText(pdf.url, claimed + 1);
      const words = m[2].split(/\s+/).filter((w) => w.length > 4).slice(0, 2);
      check(
        `“${m[2].trim()}” → page ${claimed} really is that page`,
        words.every((w) => txt.includes(w)) && new RegExp(`Page \\| ${claimed}\\b`).test(txt),
      );
    }

    // ================= The Word download =================
    const docx = await generateDocx(A, "proposal", proposalId);
    check(`Word file generated (${Math.round(docx.bytes / 1024)} KB)`, docx.bytes > 50_000);
    check("…stored with a .docx extension", docx.url.endsWith(".docx"));

    const buf = readFileSync(localPath(docx.url));
    check("…and is a real ZIP/OOXML container", buf.subarray(0, 2).toString() === "PK");

    const xml = execFileSync("unzip", ["-p", localPath(docx.url), "word/document.xml"], {
      encoding: "utf8",
      maxBuffer: 40e6,
    });
    const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");
    check("…carrying real Word tables, not a flattened dump", (xml.match(/<w:tbl>/g) ?? []).length >= 5);
    check("…and real numbered lists", xml.includes("<w:numPr>"));
    check("…set in the document's font", xml.includes("Verdana"));

    for (const [needle, label] of [
      ["Ref. No", "the cover"],
      ["Greetings", "the letter"],
      ["Table of Contents", "the contents page"],
      ["4. Introduction", "the numbered sections"],
      ["Rs. 7,80,000.00", "the quotation total in their money format"],
      ["8.2027", "the exact kW conversion"],
      ["Collection Pump – 2 Nos", "the spec-sheet quantities"],
      ["FORCE MAJEURE", "the uppercase heading (CSS casing does NOT survive — it must be literal)"],
      ["Kasthuri Nagar", "the company address"],
    ] as const) {
      check(`Word document contains ${label}`, text.includes(needle));
    }

    console.log(`\n✅ verify-proposals-p11: ${pass} checks passed`);
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
