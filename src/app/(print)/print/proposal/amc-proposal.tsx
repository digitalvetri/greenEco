import { formatINR, amountInWords } from "@/lib/money";
import { asAmcProposalData } from "@/lib/domain/proposal-document";
import {
  PLANT_TYPE_ABOUT,
  shouldPrintStandardTerms,
  amcRatesValidityNote,
  documentRefNo,
} from "@/lib/project-report-boilerplate";
import { projectReportTemplate, processUnitsFor } from "@/lib/project-report-templates";
import {
  DocSection,
  DocProse,
  docCell,
  docHeadCell,
  docP,
  docH3,
  avoidBreak,
} from "@/components/print/doc-primitives";
import { DocCover, DocSignature } from "@/components/print/doc-cover";
import type { ProposalPrintData } from "./print-data";

/**
 * The AMC Quotation — an annual maintenance contract, in the client's own format.
 *
 * Structurally it is the Project Report's opening chapters followed by a completely
 * different money section:
 *   cover → plant description → technology write-up → units + machinery →
 *   PER-MONTH charge table → GST → amount in words → scope notes
 *
 * The shared narrative blocks are READ FROM the same sources the Project Report uses
 * (`PLANT_TYPE_ABOUT`, `PROJECT_REPORT_TEMPLATES[tech]`), not copied — so correcting
 * a wording fixes both documents. The parts that vary per site (how many SBR tanks,
 * how many pumps) are snapshotted into `documentData` at creation and editable there.
 *
 * The charge table is ordinary `BOQItem` rows read as **qty = months, rate = per-month
 * charge**. That keeps `subtotal`/`gstAmount`/`grandTotal` and v48's
 * `ServiceContract.annualValue` (which seeds from the PRE-GST subtotal) untouched —
 * verified against the sample's own ₹1,75,000/month → ₹21,00,000 → ₹24,78,000.
 */
export function AmcProposalDocument({ p, v, company }: ProposalPrintData) {
  const doc = asAmcProposalData(v?.documentData);
  const boq = v?.boqItems ?? [];
  const subtotal = Number(v?.subtotal ?? 0);
  const gstAmount = Number(v?.gstAmount ?? 0);
  const grandTotal = Number(v?.grandTotal ?? 0);

  const plants = [
    {
      plantType: p.plantType,
      capacityValue: p.capacityKLD,
      capacityUnit: "KLD",
      units:
        doc.units ??
        // Same exclusion as the seeder: the process write-up is not a treatment unit.
        processUnitsFor(p.technology)
          .filter((u) => !/process$/i.test(u.unit))
          .map((u) => u.unit),
    },
    ...(doc.additionalPlants ?? []).map((a) => ({
      plantType: a.plantType,
      capacityValue: a.capacityValue ?? 0,
      capacityUnit: a.capacityUnit || "KLD",
      units: a.units ?? [],
    })),
  ];

  const capacityPhrase = (t: { plantType: string; capacityValue: number; capacityUnit: string }) =>
    t.capacityValue > 0
      ? `${t.plantType} (Capacity ${t.capacityValue} ${t.capacityUnit})`
      : t.plantType;

  const title =
    `Proposal of Annual Maintenance Contract (AMC) for the ` +
    plants.map(capacityPhrase).join(" and ") +
    ` for ${p.projectName}.`;

  const tpl = projectReportTemplate(p.technology);
  // The technology write-up (e.g. SBR's six stages) is one of the template's process
  // units. Absent for a technology with no sample document — print nothing rather
  // than another technology's process, the v45 "no silent MBBR substitution" rule.
  const processBlock = tpl
    ? processUnitsFor(p.technology).find((u) => /process$/i.test(u.unit))
    : undefined;

  const about =
    company.doc.plantAbout?.trim() || PLANT_TYPE_ABOUT[p.plantType] || PLANT_TYPE_ABOUT.STP;

  const tcs = typeof v?.terms === "string" ? v.terms : "";
  const printTcs = shouldPrintStandardTerms({
    proposalType: p.proposalType,
    terms: tcs,
    companyTemplate: company.standardTermsTemplate,
  });

  return (
    <>
      <DocCover
        refNo={documentRefNo(p.number, p.proposalType, p.plantType)}
        date={p.createdAt}
        title={title}
        company={company}
        customerName={p.customerName}
        customerAddress={p.siteAddress}
        kindAttn={p.kindAttn}
      />

      {v?.coverLetter && (
        <DocSection title="Greetings">
          <DocProse text={v.coverLetter} />
        </DocSection>
      )}

      <DocSection title={p.plantType}>
        <DocProse text={about} />
        {p.technology && (
          <p style={docP}>
            The process we use to treat the wastewater in this plant is{" "}
            <strong>{p.technology}</strong>.
          </p>
        )}
      </DocSection>

      {processBlock && (
        <DocSection title={`${p.technology} Treatment Process`}>
          <DocProse text={processBlock.body} />
        </DocSection>
      )}

      <DocSection title="Units in the Treatment Plant Process">
        {plants.map((t, i) =>
          t.units.length === 0 ? null : (
            <div key={i} style={avoidBreak}>
              <h3 style={docH3}>
                {String.fromCharCode(65 + i)}. {capacityPhrase(t)}
              </h3>
              <ol style={{ margin: "0 0 10px 22px", padding: 0, listStyleType: "lower-alpha", ...docP }}>
                {t.units.map((u, j) => (
                  <li key={j}>{u}</li>
                ))}
              </ol>
            </div>
          ),
        )}

        {(doc.equipment ?? []).length > 0 && (
          <div style={avoidBreak}>
            <h3 style={docH3}>
              {String.fromCharCode(65 + plants.filter((t) => t.units.length > 0).length)}. Machinery &
              Equipment used
            </h3>
            <ol style={{ margin: "0 0 10px 22px", padding: 0, listStyleType: "lower-alpha", ...docP }}>
              {(doc.equipment ?? []).map((e, i) => (
                <li key={i}>
                  {e.name}
                  {e.qty ? ` — ${e.qty}` : ""}
                </li>
              ))}
            </ol>
          </div>
        )}
      </DocSection>

      <section style={{ pageBreakBefore: "always" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...docHeadCell, width: 46, textAlign: "center" }}>SL.NO</th>
              <th style={docHeadCell}>DESCRIPTION OF WORK</th>
              <th style={{ ...docHeadCell, width: 96, textAlign: "right" }}>PER MONTH CHARGES</th>
              <th style={{ ...docHeadCell, width: 92, textAlign: "center" }}>NUMBER OF MONTHS</th>
              <th style={{ ...docHeadCell, width: 118, textAlign: "right" }}>TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {boq.map((b, i) => (
              <tr key={b.id} style={avoidBreak}>
                <td style={{ ...docCell, textAlign: "center", verticalAlign: "top" }}>{i + 1}</td>
                <td style={{ ...docCell, textAlign: "justify" }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{b.item}</div>
                  {b.specification && (
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 3, color: "#333" }}>
                      {b.specification}
                    </div>
                  )}
                </td>
                <td style={{ ...docCell, textAlign: "right", verticalAlign: "top" }}>
                  {formatINR(b.rate)}
                </td>
                <td style={{ ...docCell, textAlign: "center", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  {monthsLabel(b.qty, b.unit)}
                </td>
                <td style={{ ...docCell, textAlign: "right", verticalAlign: "top" }}>
                  {formatINR(b.amount)}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={2}>
                Sub Total
              </td>
              <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>
                {formatINR(perMonthTotal(boq))}
              </td>
              <td style={docCell} />
              <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>{formatINR(subtotal)}</td>
            </tr>
            <tr>
              <td style={docCell} colSpan={4}>
                GST 18 %
              </td>
              <td style={{ ...docCell, textAlign: "right" }}>{formatINR(gstAmount)}</td>
            </tr>
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={2}>
                {/* Literal caps — CSS casing does not survive the Word export. */}
                {amountInWords(grandTotal).toUpperCase()}
              </td>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={2}>
                TOTAL AMOUNT WITH 18% GST
              </td>
              <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>{formatINR(grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ ...docP, marginTop: 10 }}>
          {doc.ratesValidityNote?.trim() || amcRatesValidityNote(doc.termMonths)}
        </p>
      </section>

      {doc.notes?.trim() && (
        <DocSection title="Note">
          <DocProse text={doc.notes} />
        </DocSection>
      )}

      <DocSignature
        company={company}
        signatoryName={company.doc.signatoryName}
        signatoryTitle="Authorized Signatory"
        signatoryPhone={company.doc.signatoryPhone}
      />

      {printTcs && (
        <DocSection title="Terms & Conditions" breakBefore>
          <DocProse text={tcs} />
        </DocSection>
      )}
    </>
  );
}

/** Σ of the per-month rates — the sample prints this beside the yearly Sub Total. */
function perMonthTotal(boq: { rate: string }[]): number {
  return boq.reduce((a, b) => a + Number(b.rate || 0), 0);
}

/** "12" + "Month" → "12 Month", matching the sample's own column. */
function monthsLabel(qty: string, unit: string): string {
  const n = Number(qty);
  const q = Number.isFinite(n) ? String(n) : qty;
  return `${q} ${unit || "Month"}`;
}
