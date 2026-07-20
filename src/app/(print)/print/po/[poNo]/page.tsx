import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getPO } from "@/server/services/materials";
import { getCompanySettings } from "@/server/services/company-settings";
import { formatINR, amountInWords } from "@/lib/money";
import { computeGst } from "@/lib/gst";
import { PrintShell } from "@/components/print/print-shell";
import { td, th } from "@/components/print/print-styles";
import { Decimal } from "decimal.js";

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
  const company = await getCompanySettings(session.companyId);

  // The vendor is the "supplier" on this document, Green Ecocare (the buyer) is the
  // place of supply — the mirror image of the customer Tax Invoice's roles. A vendor's
  // GSTIN encodes its state as the first 2 digits (the same convention GSTINs always
  // use); no vendor with a GSTIN → default to intra-state, matching the same
  // documented simplification already used for orders with no clientStateCode.
  const vendorStateCode = po.vendor.gstin?.slice(0, 2) || company.stateCode;
  const gst = computeGst({
    taxableAmount: po.totalValue,
    supplierStateCode: vendorStateCode,
    placeOfSupplyStateCode: company.stateCode,
  });
  const exactTotal = new Decimal(gst.total);
  const roundedTotal = exactTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = roundedTotal.minus(exactTotal);

  // Ship-to is often a client's site, not Green Ecocare's own warehouse (drop-ship
  // straight to the project) — show the site's client + contact when there is one.
  const shipToName = po.destination?.clientName || po.destination?.name || "—";
  const shipToAddress = po.destination?.siteAddress || company.address || "—";
  const shipToPhone = po.destination?.clientPhone;

  return (
    <PrintShell title="PURCHASE ORDER" docNo={`${po.poNo} · ${new Date(po.createdAt).toLocaleDateString("en-IN")}`} company={company}>
      <section style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
        <div>M/S. {po.vendor.name}</div>
        {po.vendor.address && <div style={{ color: "#555" }}>{po.vendor.address}</div>}
        {po.vendor.gstin && <div style={{ color: "#555" }}>GSTIN: {po.vendor.gstin}</div>}
        {po.vendor.phone && <div style={{ color: "#555" }}>Phone: {po.vendor.phone}</div>}
      </section>

      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>SUB: PURCHASE ORDER — {po.poNo}</p>

      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        Dear Sirs,
        <br />
        Further to our discussion, we are pleased to place the order for the following items, subject to
        the terms below.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 32 }}>Sl.No</th>
            <th style={th}>Description</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={th}>Unit</th>
            <th style={{ ...th, textAlign: "right" }}>Rate</th>
            <th style={{ ...th, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{l.name}</td>
              <td style={{ ...td, textAlign: "right" }}>{l.qty}</td>
              <td style={td}>{l.unit}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(String(l.rate))}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatINR(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 280, fontSize: 13, marginBottom: 8 }}>
        <Line label="Total" value={formatINR(gst.taxable)} />
        {gst.taxType === "CGST_SGST" ? (
          <>
            <Line label={`CGST @ ${gst.rate / 2}%`} value={formatINR(gst.cgst)} />
            <Line label={`SGST @ ${gst.rate / 2}%`} value={formatINR(gst.sgst)} />
          </>
        ) : (
          <Line label={`IGST @ ${gst.rate}%`} value={formatINR(gst.igst)} />
        )}
        {!roundOff.isZero() && <Line label="Round off" value={formatINR(roundOff.toFixed(2))} />}
        <Line label="Total" value={formatINR(roundedTotal.toFixed(2))} bold />
      </div>

      <p style={{ fontSize: 13, fontStyle: "italic", marginBottom: 16 }}>
        Rupees: <strong>{amountInWords(roundedTotal)}</strong>
      </p>

      <section style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700 }}>TERMS:</div>
        <div>Delivery: Expected by {new Date(po.expectedDate).toLocaleDateString("en-IN")}</div>
        <div>Payment: {po.vendor.terms || "As mutually agreed"}</div>
        {shipToPhone && <div>Call before delivery: {shipToPhone}</div>}
      </section>

      <p style={{ fontSize: 13, marginBottom: 20 }}>
        Kindly let us have your confirmation and dispatch details for the above. We would request you
        kindly dispatch as early as possible.
        <br />
        Yours faithfully,
      </p>

      <div style={{ fontSize: 13, marginBottom: 16 }}>
        For {company.name}
        <br />
        {po.createdByName ?? ""}
        {po.createdByPhone && <div style={{ color: "#555" }}>Phone: {po.createdByPhone}</div>}
      </div>

      <section style={{ display: "flex", justifyContent: "space-between", gap: 24, borderTop: "1px solid #ddd", paddingTop: 12, fontSize: 12 }}>
        <div>
          <div style={{ color: "#888", textTransform: "uppercase", fontSize: 10 }}>Bill to address</div>
          <div style={{ fontWeight: 700 }}>{company.name}</div>
          {company.gstin && <div>GSTIN: {company.gstin}</div>}
          <div>{company.address}</div>
          {company.phone && <div>Phone: {company.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#888", textTransform: "uppercase", fontSize: 10 }}>Shipping to address</div>
          <div style={{ fontWeight: 700 }}>{shipToName}</div>
          <div>{shipToAddress}</div>
          {shipToPhone && <div>Contact: {shipToPhone}</div>}
        </div>
      </section>

      {shipToPhone && (
        <p style={{ marginTop: 16, fontSize: 11, color: "#888" }}>
          Note: Before delivery please call the above number.
        </p>
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
