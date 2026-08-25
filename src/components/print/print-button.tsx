"use client";

import { Printer } from "lucide-react";

/**
 * "Print / Save as PDF" for the structured proposal documents, which render their own
 * cover page instead of PrintShell's branded header and so can't inherit its button.
 * Hidden when printing (`.no-print`), same as the shell's.
 */
export function PrintActionButton() {
  return (
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
  );
}
