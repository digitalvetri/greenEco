import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getPaymentStatement } from "@/server/services/order";
import { getCompanySettings } from "@/server/services/company-settings";
import { formatINR } from "@/lib/money";
import { PrintShell } from "@/components/print/print-shell";
import { td, th } from "@/components/print/print-styles";

export const dynamic = "force-dynamic";

export default async function PaymentStatementPrint({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderId } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "payment-statement", orderId);
  if (session.role !== "ADMIN") notFound();
  let data;
  try {
    data = await getPaymentStatement(session, orderId);
  } catch {
    notFound();
  }
  const { order, invoices, advanceReceived, invoiceRaised, paymentReceived } = data;
  const company = await getCompanySettings(session.companyId);

  return (
    <PrintShell title="PAYMENT STATEMENT" docNo={order.orderNo} company={company}>
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{order.clientName}</div>
        <div style={{ fontSize: 13, color: "#555" }}>{order.siteAddress}</div>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={td}>Project Value</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatINR(order.projectValue.toString())}</td>
          </tr>
          <tr>
            <td style={td}>Advance Received</td>
            <td style={{ ...td, textAlign: "right" }}>{formatINR(advanceReceived)}</td>
          </tr>
          <tr>
            <td style={td}>Invoice Raised</td>
            <td style={{ ...td, textAlign: "right" }}>{formatINR(invoiceRaised)}</td>
          </tr>
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Payment Received</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#0f7a4d" }}>
              {formatINR(paymentReceived)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Milestones &amp; Receipts</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={th}>Milestone</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
            <th style={th}>Status</th>
            <th style={th}>Receipts</th>
          </tr>
        </thead>
        <tbody>
          {order.milestones.map((m) => (
            <tr key={m.seq}>
              <td style={td}>{m.description}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(m.amount.toString())}</td>
              <td style={td}>{m.status.replace(/_/g, " ")}</td>
              <td style={td}>
                {m.receipts.length === 0
                  ? "—"
                  : m.receipts
                      .map(
                        (r) =>
                          `${new Date(r.date).toLocaleDateString("en-IN")} · ${formatINR(r.amount.toString())} (${r.mode}${r.refNo ? ` ${r.refNo}` : ""})`,
                      )
                      .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {invoices.length > 0 && (
        <>
          <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Invoices</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Invoice No.</th>
                <th style={th}>Date</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.invoiceNo}>
                  <td style={td}>
                    {inv.invoiceNo}
                    {inv.isCreditNote ? " (Credit Note)" : ""}
                  </td>
                  <td style={td}>{new Date(inv.date).toLocaleDateString("en-IN")}</td>
                  <td style={td}>{inv.status}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formatINR(inv.total.toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PrintShell>
  );
}
