"use client";

import { Printer } from "lucide-react";

/** Branded print header + a "Print / Save PDF" button hidden when printing. */
export function PrintShell({
  title,
  docNo,
  gstin,
  children,
}: {
  title: string;
  docNo: string;
  gstin?: string;
  children: React.ReactNode;
}) {
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
          <img src="/brand/logo-mark.png" alt="Green Ecocare" width={44} height={44} style={{ borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f7a4d" }}>Green Ecocare Pvt Ltd</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              Wastewater Treatment Plant Solutions · Coimbatore, Tamil Nadu
            </div>
            {gstin && <div style={{ fontSize: 12, color: "#555" }}>GSTIN: {gstin}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#555" }}>{docNo}</div>
        </div>
      </header>

      {children}

      <footer style={{ marginTop: 40, borderTop: "1px solid #ddd", paddingTop: 10, fontSize: 11, color: "#888", textAlign: "center" }}>
        Green Ecocare Pvt Ltd · This is a computer-generated document.
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
