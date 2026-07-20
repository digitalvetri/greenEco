import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getInvoice } from "@/server/services/invoice";
import { getCompanySettings } from "@/server/services/company-settings";
import { formatINR } from "@/lib/money";
import { PrintShell } from "@/components/print/print-shell";
import { td, th } from "@/components/print/print-styles";

export const dynamic = "force-dynamic";

export default async function InvoicePrint({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceNo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { invoiceNo } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "invoice", invoiceNo);
  const inv = await getInvoice(session, invoiceNo);
  if (!inv) notFound();
  const company = await getCompanySettings(session.companyId);

  const lines = (inv.lineItems as Array<{ description: string; sac?: string; amount: string }>) ?? [];
  const gst = inv.gstBreakup as { cgst: string; sgst: string; igst: string; rate: number };
  const order = inv.milestone?.order;

  return (
    <PrintShell
      title={inv.isCreditNote ? "CREDIT NOTE" : "TAX INVOICE"}
      docNo={`${inv.invoiceNo} · ${new Date(inv.date).toLocaleDateString("en-IN")}`}
      company={company}
    >
      {order && (
        <section style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>Bill To:</strong> {order.clientName}
          <br />
          {order.siteAddress}
          <br />
          {order.clientGstin && (
            <>
              <span style={{ color: "#555" }}>GSTIN: {order.clientGstin}</span>
              <br />
            </>
          )}
          <span style={{ color: "#555" }}>Project: {order.orderNo}</span>
        </section>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 32 }}>Sl.No</th>
            <th style={th}>Description</th>
            <th style={th}>SAC</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{l.description}</td>
              <td style={td}>{l.sac ?? "-"}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 280, fontSize: 13 }}>
        {inv.taxType === "CGST_SGST" ? (
          <>
            <Line label={`CGST @ ${gst.rate / 2}%`} value={formatINR(gst.cgst)} />
            <Line label={`SGST @ ${gst.rate / 2}%`} value={formatINR(gst.sgst)} />
          </>
        ) : (
          <Line label={`IGST @ ${gst.rate}%`} value={formatINR(gst.igst)} />
        )}
        <Line label="Total" value={formatINR(inv.total.toString())} bold />
      </div>

      <p style={{ marginTop: 14, fontSize: 13, fontStyle: "italic" }}>
        Amount in words: <strong>{inv.amountWords}</strong>
      </p>

      {!inv.isCreditNote && (
        <p style={{ marginTop: 24, fontSize: 13, lineHeight: 1.6 }}>
          Thanking you,
        </p>
      )}

      <div style={{ marginTop: 40, fontSize: 13 }}>
        For {company.name}
      </div>
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
