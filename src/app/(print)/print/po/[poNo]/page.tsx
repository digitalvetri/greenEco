import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getPO } from "@/server/services/materials";
import { formatINR } from "@/lib/money";
import { env } from "@/lib/env";
import { PrintShell, td, th } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPrint({
  params,
  searchParams,
}: {
  params: Promise<{ poNo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { poNo } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "po", poNo);
  if (session.role !== "ADMIN") notFound();
  const po = await getPO(session, poNo);
  if (!po) notFound();

  return (
    <PrintShell title="PURCHASE ORDER" docNo={`${po.poNo} · ${new Date(po.createdAt).toLocaleDateString("en-IN")}`} gstin={env.companyGstin}>
      <section style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase" }}>Vendor</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{po.vendor.name}</div>
          {po.vendor.address && <div style={{ fontSize: 13, color: "#555" }}>{po.vendor.address}</div>}
          <div style={{ fontSize: 13, color: "#555" }}>{po.vendor.phone}</div>
          {po.vendor.gstin && <div style={{ fontSize: 13, color: "#555" }}>GSTIN: {po.vendor.gstin}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase" }}>Deliver to</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{po.destination?.name ?? "—"}</div>
          <div style={{ fontSize: 13, color: "#555" }}>Expected: {new Date(po.expectedDate).toLocaleDateString("en-IN")}</div>
          <div style={{ fontSize: 13, color: "#555" }}>Status: {po.status}</div>
        </div>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={th}>Unit</th>
            <th style={{ ...th, textAlign: "right" }}>Rate</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((l, i) => (
            <tr key={i}>
              <td style={td}>{l.name}</td>
              <td style={{ ...td, textAlign: "right" }}>{l.qty}</td>
              <td style={td}>{l.unit}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(String(l.rate))}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatINR(po.totalValue)}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ fontSize: 11, color: "#888" }}>
        Please confirm receipt of this purchase order and expected delivery date. Deliver against PO number {po.poNo}.
      </p>
    </PrintShell>
  );
}
