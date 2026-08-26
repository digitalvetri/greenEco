import { formatINR, amountInWords } from "@/lib/money";
import { asServiceProposalData } from "@/lib/domain/proposal-document";
import { docCell, docHeadCell, docP, avoidBreak } from "@/components/print/doc-primitives";
import type { ProposalPrintData } from "./print-data";

/**
 * The Service Proposal — printed as the client's one-page **Proforma Invoice**, which
 * is a deliberately different document from every other proposal format here:
 *
 *   • **No cover page.** It opens straight into a letterhead block, and that block
 *     prints the GSTIN — the Project Report's cover does not.
 *   • **It HAS a rate column** (S.No | Description | Quantity | Rate per Quantity |
 *     Total). That is the opposite of the BOQ Proposal, where the rate column was
 *     removed on purpose because their BOQ samples quote a lump sum per line. The two
 *     tables therefore do NOT share a component.
 *   • **A declaration, not Terms & Conditions**: "This rate is valid for N days only."
 *     N is the proposal's own `validityDays` — never the sample's hardcoded 45.
 */
export function ServiceProformaDocument({ p, v, company }: ProposalPrintData) {
  const doc = asServiceProposalData(v?.documentData);
  const boq = v?.boqItems ?? [];
  const subtotal = Number(v?.subtotal ?? 0);
  const gstAmount = Number(v?.gstAmount ?? 0);
  const grandTotal = Number(v?.grandTotal ?? 0);

  // Who the proforma is addressed to. The sample bills a PWD section office rather
  // than the site, so it's overridable — but it defaults to the enquiry's own
  // customer and address rather than being left blank.
  const addressedTo =
    doc.addressedTo?.trim() ||
    [p.kindAttn, p.customerName, p.siteAddress].filter(Boolean).join(",\n");

  const declaration =
    doc.declaration?.trim() || `This rate is valid for ${v?.validityDays ?? 30} days only.`;

  return (
    <>
      {/* Letterhead — this format's own, with GSTIN. */}
      <header style={{ marginBottom: 14, ...docP }}>
        <div style={{ fontWeight: 700 }}>{company.name},</div>
        {company.address ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{company.address}</div>
        ) : null}
        {company.gstin && <div>GSTIN: {company.gstin}</div>}
        {company.phone && <div>Mob. No: {company.phone}</div>}
      </header>

      <h2 style={{ textAlign: "center", fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>
        Proforma Invoice
      </h2>

      <div style={{ display: "flex", justifyContent: "space-between", ...docP, marginBottom: 10 }}>
        <span>Quotation No: {p.number}</span>
        <span>
          Date:{" "}
          {p.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
      </div>

      <div style={{ ...docP, marginBottom: 12 }}>
        <div>To.</div>
        <div style={{ whiteSpace: "pre-wrap", marginLeft: 18 }}>{addressedTo}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...docHeadCell, width: 46, textAlign: "center" }}>S. No</th>
            <th style={docHeadCell}>Description</th>
            <th style={{ ...docHeadCell, width: 76, textAlign: "center" }}>Quantity</th>
            <th style={{ ...docHeadCell, width: 96, textAlign: "right" }}>Rate per Quantity</th>
            <th style={{ ...docHeadCell, width: 106, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {boq.map((b, i) => (
            <tr key={b.id} style={avoidBreak}>
              <td style={{ ...docCell, textAlign: "center", verticalAlign: "top" }}>{i + 1}</td>
              <td style={{ ...docCell }}>
                <div style={{ whiteSpace: "pre-wrap" }}>{b.item}</div>
                {b.specification && (
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 3, color: "#333" }}>
                    {b.specification}
                  </div>
                )}
              </td>
              <td style={{ ...docCell, textAlign: "center", verticalAlign: "top", whiteSpace: "nowrap" }}>
                {formatQty(b.qty, b.unit)}
              </td>
              <td style={{ ...docCell, textAlign: "right", verticalAlign: "top" }}>
                {Number(b.rate) > 0 ? formatINR(b.rate) : ""}
              </td>
              <td style={{ ...docCell, textAlign: "right", verticalAlign: "top" }}>
                {Number(b.amount) > 0 ? formatINR(b.amount) : ""}
              </td>
            </tr>
          ))}
          <tr>
            <td style={docCell} colSpan={3} />
            <td style={{ ...docCell, fontWeight: 600 }}>Total</td>
            <td style={{ ...docCell, textAlign: "right" }}>{formatINR(subtotal)}</td>
          </tr>
          <tr>
            <td style={docCell} colSpan={3} />
            <td style={docCell}>GST 18%</td>
            <td style={{ ...docCell, textAlign: "right" }}>{formatINR(gstAmount)}</td>
          </tr>
          <tr>
            <td style={docCell} colSpan={3} />
            <td style={{ ...docCell, fontWeight: 700 }}>Grand Total</td>
            <td style={{ ...docCell, textAlign: "right", fontWeight: 700 }}>{formatINR(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <p style={{ ...docP, marginTop: 8 }}>Total: {amountInWords(grandTotal)}</p>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, ...docP }}>
        <div>
          <div style={{ fontWeight: 600 }}>Declaration:</div>
          <div>{declaration}</div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div>For {company.name},</div>
          <div style={{ height: 42 }} />
          <div>Authorized Signatory</div>
        </div>
      </div>
    </>
  );
}

/** "2" + "No" → "2 Nos"; matches the sample's "1 No / 2 Nos / 15 Nos / 1 Set". */
function formatQty(qty: string, unit: string): string {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return "";
  const u = unit || "No";
  return `${n} ${n === 1 ? u : u.endsWith("s") ? u : u + "s"}`;
}
