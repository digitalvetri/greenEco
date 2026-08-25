import { formatINR, amountInWords } from "@/lib/money";
import { asBoqProposalData } from "@/lib/domain/proposal-document";
import { shouldPrintStandardTerms } from "@/lib/project-report-boilerplate";
import { DocSection, DocProse, docCell, docHeadCell, docP, avoidBreak } from "@/components/print/doc-primitives";
import { DocCover, DocSignature } from "@/components/print/doc-cover";
import type { ProposalPrintData } from "./print-data";

/**
 * The BOQ Proposal — an itemised machinery estimate, a deliberately different document
 * from the Project Report.
 *
 * Two things distinguish it, both taken from the client's sample:
 *   • **No rate column.** The table is S.NO | DESCRIPTION | QTY | AMOUNT. Their sample
 *     quotes a lump sum per line ("2 SETS … 1,60,000.00") rather than a unit rate, so
 *     printing rate would show a number the customer never sees on their real quotes.
 *     The rate still exists on BOQItem and drives the totals — it just isn't printed.
 *   • **Long multi-paragraph descriptions.** Each line is a full supply-and-installation
 *     spec, so the description cell wraps freely and rows avoid page breaks.
 */
export function BoqProposalDocument({ p, v, company }: ProposalPrintData) {
  const doc = asBoqProposalData(v?.documentData);
  const boq = v?.boqItems ?? [];
  const subtotal = Number(v?.subtotal ?? 0);
  const gstAmount = Number(v?.gstAmount ?? 0);
  const grandTotal = Number(v?.grandTotal ?? 0);

  const tcs = typeof v?.terms === "string" ? v.terms : "";
  // A BOQ has no numbered §10.2–§14 sections, so its T&Cs page always prints when set.
  const printTcs = shouldPrintStandardTerms({
    proposalType: p.proposalType,
    terms: tcs,
    companyTemplate: company.standardTermsTemplate,
  });

  const title =
    doc.estimateTitle?.trim() ||
    `${p.capacityKLD ? `${Math.round(p.capacityKLD * 1000).toLocaleString("en-IN")} LITRES PER DAY ` : ""}${p.plantType} ${p.projectName}`.toUpperCase();

  return (
    <>
      <DocCover
        refNo={p.number}
        date={p.createdAt}
        title={`Proposal for the ${p.plantType} machineries estimate for ${p.projectName} at ${p.siteAddress}.`}
        company={company}
        customerName={p.customerName}
        customerAddress={p.siteAddress}
        kindAttn={p.kindAttn}
      />

      <section>
        <h2 style={{ textAlign: "center", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{title}</h2>
        <h3 style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, margin: "0 0 14px", color: "#444" }}>
          {doc.estimateSubtitle?.trim() || "MECHANICAL, ELECTRICAL AND PLUMBING MATERIAL DETAILS"}
        </h3>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...docHeadCell, width: 46, textAlign: "center" }}>S.NO</th>
              <th style={docHeadCell}>DESCRIPTION</th>
              <th style={{ ...docHeadCell, width: 86, textAlign: "center" }}>QTY</th>
              <th style={{ ...docHeadCell, width: 130, textAlign: "right" }}>AMOUNT IN RS.</th>
            </tr>
          </thead>
          <tbody>
            {boq.map((b, i) => (
              <tr key={b.id} style={avoidBreak}>
                <td style={{ ...docCell, textAlign: "center", verticalAlign: "top" }}>{i + 1}</td>
                <td style={{ ...docCell, textAlign: "justify" }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{b.item}</div>
                  {b.specification && (
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 3, color: "#333" }}>{b.specification}</div>
                  )}
                </td>
                <td style={{ ...docCell, textAlign: "center", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  {formatQty(b.qty, b.unit)}
                </td>
                <td style={{ ...docCell, textAlign: "right", verticalAlign: "top" }}>{formatINR(b.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={3}>
                TOTAL
              </td>
              <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>{formatINR(subtotal)}</td>
            </tr>
            <tr>
              <td style={docCell} colSpan={3}>
                GST 18 %
              </td>
              <td style={{ ...docCell, textAlign: "right" }}>{formatINR(gstAmount)}</td>
            </tr>
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={3}>
                TOTAL AMOUNT WITH GST
              </td>
              <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>{formatINR(grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ ...docP, marginTop: 10, fontWeight: 600, textTransform: "uppercase" }}>
          {amountInWords(grandTotal)}
        </p>

        <DocSignature
          company={company}
          signatoryName={company.doc.signatoryName}
          signatoryTitle="Authorized Signatory"
          signatoryPhone={company.doc.signatoryPhone}
        />
      </section>

      {printTcs && (
        <DocSection title="Terms & Conditions" breakBefore>
          <DocProse text={tcs} />
        </DocSection>
      )}
    </>
  );
}

/** "2" + "Set" → "2 SETS"; matches the sample's "1 SET / 2 SETS / 3 KGS / 1 lot". */
function formatQty(qty: string, unit: string): string {
  const n = Number(qty);
  const q = Number.isFinite(n) ? String(n % 1 === 0 ? n : n) : qty;
  const plural = Number.isFinite(n) && n !== 1 ? `${unit}S` : unit;
  return `${q} ${plural}`.toUpperCase();
}
