import { formatINR } from "@/lib/money";
import { td, th } from "@/components/print/print-styles";
import type { ProposalPrintData } from "./print-data";

/**
 * The pre-Phase-C proposal layout, kept as the fallback for:
 *   • proposals created before proposal types existed (no `proposalType`)
 *   • Service / AMC proposals, whose real document formats the client has NOT yet
 *     supplied — inventing a layout for those would be worse than a plain one
 *   • "Others"
 *
 * Unchanged apart from taking already-loaded data instead of doing its own auth +
 * fetch, which now happens once in page.tsx.
 */
export function GenericProposalDocument({ p, v }: ProposalPrintData) {
  const scope = (v?.scopeOfWork ?? {}) as Record<string, string>;
  const terms = (v?.paymentTerms ?? []) as Array<{ description: string; percent: number }>;
  const technicalSpecs = (v?.technicalSpecs ?? []) as Array<{ section: string; item: string; spec: string; qty: string }>;
  const electricalLoad = (v?.electricalLoad ?? []) as Array<{ description: string; hp: number }>;
  // Legacy versions stored tcs as `[]` (pre-Phase-2); normalize to a string.
  const tcs = typeof v?.terms === "string" ? v.terms : "";

  return (
    <>
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{p.projectName}</div>
        <div style={{ fontSize: 14, color: "#555" }}>{p.siteAddress}</div>
        <div style={{ fontSize: 14, color: "#555" }}>
          {p.plantType} · {p.technology} · {p.capacityKLD} KLD
        </div>
        {p.kindAttn && <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>Kind Attn: {p.kindAttn}</div>}
      </section>

      {v?.heroImageUrl && (
        <section style={{ marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by headless Chromium into a PDF, not the Next image pipeline */}
          <img
            src={v.heroImageUrl}
            alt=""
            style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, display: "block" }}
          />
        </section>
      )}

      {v?.coverLetter && (
        <section style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{v.coverLetter}</p>
        </section>
      )}

      {v?.technicalText && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Technical Write-up</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v.technicalText}</p>
        </section>
      )}

      {v?.technologyExplainer && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>About {p.technology}</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v.technologyExplainer}</p>
        </section>
      )}

      {Object.keys(scope).length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Scope of Work</h3>
          <ul style={{ fontSize: 14, lineHeight: 1.5, listStyleType: "disc", paddingLeft: 20 }}>
            {Object.entries(scope).map(([k, val]) => (
              <li key={k}>
                <strong style={{ textTransform: "capitalize" }}>{k}:</strong> {val}
              </li>
            ))}
          </ul>
        </section>
      )}

      {technicalSpecs.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Technical Specifications</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Section</th>
                <th style={th}>Item</th>
                <th style={th}>Specification</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {technicalSpecs.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.section}</td>
                  <td style={td}>{r.item}</td>
                  <td style={td}>{r.spec}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {electricalLoad.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Electrical Load Summary</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: "right" }}>HP</th>
              </tr>
            </thead>
            <tbody>
              {electricalLoad.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.description}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.hp}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Total connected load</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                  {electricalLoad.reduce((a, l) => a + (Number(l.hp) || 0), 0)} HP
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section style={{ marginBottom: 16 }}>
        <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Bill of Quantities</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              <th style={th}>Unit</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Rate</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {v?.boqItems.map((b) => (
              <tr key={b.id}>
                <td style={td}>{b.item}</td>
                <td style={td}>{b.unit}</td>
                <td style={{ ...td, textAlign: "right" }}>{b.qty}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatINR(b.rate)}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatINR(b.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {v && (
          <div style={{ marginTop: 10, marginLeft: "auto", width: 260, fontSize: 14 }}>
            <Line label="Subtotal" value={formatINR(v.subtotal)} />
            <Line label="GST @ 18%" value={formatINR(v.gstAmount)} />
            <Line label="Grand Total" value={formatINR(v.grandTotal)} bold />
          </div>
        )}
      </section>

      {terms.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Payment Terms</h3>
          <ol style={{ fontSize: 14, lineHeight: 1.6, listStyleType: "decimal", paddingLeft: 20 }}>
            {terms.map((t, i) => (
              <li key={i}>
                {t.percent}% — {t.description}
              </li>
            ))}
          </ol>
        </section>
      )}

      {v?.pointsToNote && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Points to Note</h3>
          <ul style={{ fontSize: 14, lineHeight: 1.6, listStyleType: "disc", paddingLeft: 20 }}>
            {v.pointsToNote.split("\n").filter(Boolean).map((line, i) => (
              <li key={i}>{line.replace(/^[-•]\s*/, "")}</li>
            ))}
          </ul>
        </section>
      )}

      {tcs && (
        <section style={{ marginBottom: 16, pageBreakBefore: "always" }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 15.5 }}>Terms &amp; Conditions</h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{tcs}</p>
        </section>
      )}
    </>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400, padding: "3px 0", borderTop: bold ? "1px solid #0f7a4d" : "none" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
