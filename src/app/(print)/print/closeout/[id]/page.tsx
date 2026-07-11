import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { closeoutData } from "@/server/services/erection";
import { formatINR } from "@/lib/money";
import { env } from "@/lib/env";
import { PrintShell, td, th } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

export default async function CloseoutPrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "closeout", id);
  if (session.role !== "ADMIN") notFound();
  let data;
  try {
    data = await closeoutData(session, id);
  } catch {
    notFound();
  }

  return (
    <PrintShell title="PROJECT CLOSE-OUT" docNo={data.order.orderNo} gstin={env.companyGstin}>
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{data.order.clientName}</div>
        <div style={{ fontSize: 13, color: "#555" }}>{data.order.siteAddress}</div>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr><td style={td}>Contract Value</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatINR(data.contractValue)}</td></tr>
          <tr><td style={td}>Total Approved Cost (Spent)</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.spent)}</td></tr>
          <tr><td style={td}>Committed (open POs)</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.committed)}</td></tr>
          <tr><td style={{ ...td, fontWeight: 700 }}>Gross Margin</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: Number(data.grossMargin) < 0 ? "#dc2626" : "#0f7a4d" }}>{formatINR(data.grossMargin)} ({data.grossMarginPct}%)</td></tr>
        </tbody>
      </table>

      <h3 style={{ color: "#0f7a4d", fontSize: 14 }}>Cost Breakup</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={th}>Category</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td style={td}>Labour</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.categories.labour)}</td></tr>
          <tr><td style={td}>Site Purchases</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.categories.sitePurchase)}</td></tr>
          <tr><td style={td}>Material Consumption</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.categories.consumption)}</td></tr>
          <tr><td style={td}>Other</td><td style={{ ...td, textAlign: "right" }}>{formatINR(data.categories.other)}</td></tr>
        </tbody>
      </table>
    </PrintShell>
  );
}
