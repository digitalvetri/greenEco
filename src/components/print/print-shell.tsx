"use client";

import { Printer } from "lucide-react";

export interface PrintLetterhead {
  name: string;
  gstin?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  branches?: string[];
}

/** Branded print header + a "Print / Save PDF" button hidden when printing. */
export function PrintShell({
  title,
  docNo,
  gstin,
  company,
  children,
}: {
  title: string;
  docNo: string;
  /** @deprecated pass `company` instead — kept so older call sites still compile. */
  gstin?: string;
  company?: PrintLetterhead;
  children: React.ReactNode;
}) {
  const co: PrintLetterhead = company ?? { name: "Green Ecocare Pvt Ltd", gstin };
  return (
    <div data-print-shell>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 14mm; } }`}</style>

      <div className="no-print" style={{ marginBottom: 16, textAlign: "right" }}>
        <button
          onClick={() => window.print()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#0f7a4d",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "3px solid #0f7a4d",
          paddingBottom: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static PDF header, rendered by headless Chromium outside Next's image pipeline */}
          <img src="/brand/logo-mark.png" alt={co.name} width={44} height={44} style={{ borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f7a4d" }}>{co.name}</div>
            {co.tagline && <div style={{ fontSize: 11, fontStyle: "italic", color: "#1560bd" }}>{co.tagline}</div>}
            {co.gstin && <div style={{ fontSize: 12, color: "#555" }}>GSTIN: {co.gstin}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#555" }}>{docNo}</div>
        </div>
      </header>

      {children}

      <footer style={{ marginTop: 40, borderTop: "1px solid #ddd", paddingTop: 10, fontSize: 11, color: "#888", textAlign: "center" }}>
        {co.address && <div>{co.address}</div>}
        <div>
          {[
            co.phone && `Phone: ${co.phone}`,
            co.website && co.website,
            co.email && `Email: ${co.email}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {co.branches && co.branches.length > 0 && <div>Branches: {co.branches.join(", ")}</div>}
        <div style={{ marginTop: 4 }}>This is a computer-generated document.</div>
      </footer>
    </div>
  );
}

export const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 13 };
export const th: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "2px solid #0f7a4d",
  fontSize: 12,
  textAlign: "left",
  color: "#0f7a4d",
};
