import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getProposal } from "@/server/services/proposal";
import { formatINR } from "@/lib/money";
import { env } from "@/lib/env";
import { PrintShell, td, th } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

export default async function ProposalPrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "proposal", id);
  const p = await getProposal(session, id);
  if (!p) notFound();
  const v = p.versions.find((x) => x.versionNo === p.currentVersion) ?? p.versions[0];
  const scope = (v?.scopeOfWork ?? {}) as Record<string, string>;
  const terms = (v?.paymentTerms ?? []) as Array<{ description: string; percent: number }>;

  return (
    <PrintShell title="PROPOSAL" docNo={`${p.number} · v${v?.versionNo ?? 1}`} gstin={env.companyGstin}>
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{p.projectName}</div>
        <div style={{ fontSize: 13, color: "#555" }}>{p.siteAddress}</div>
        <div style={{ fontSize: 13, color: "#555" }}>
          {p.plantType} · {p.technology} · {p.capacityKLD} KLD
        </div>
      </section>

      {v?.technicalText && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Technical Write-up</h3>
          <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v.technicalText}</p>
        </section>
      )}

      {Object.keys(scope).length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Scope of Work</h3>
          <ul style={{ fontSize: 13, lineHeight: 1.5 }}>
            {Object.entries(scope).map(([k, val]) => (
              <li key={k}>
                <strong style={{ textTransform: "capitalize" }}>{k}:</strong> {val}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginBottom: 16 }}>
        <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Bill of Quantities</h3>
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
                <td style={{ ...td, textAlign: "right" }}>{b.qty.toString()}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatINR(b.rate.toString())}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatINR(b.amount.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {v && (
          <div style={{ marginTop: 10, marginLeft: "auto", width: 260, fontSize: 13 }}>
            <Line label="Subtotal" value={formatINR(v.subtotal.toString())} />
            <Line label="GST @ 18%" value={formatINR(v.gstAmount.toString())} />
            <Line label="Grand Total" value={formatINR(v.grandTotal.toString())} bold />
          </div>
        )}
      </section>

      {terms.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Payment Terms</h3>
          <ol style={{ fontSize: 13, lineHeight: 1.6 }}>
            {terms.map((t, i) => (
              <li key={i}>
                {t.percent}% — {t.description}
              </li>
            ))}
          </ol>
        </section>
      )}
    </PrintShell>
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
