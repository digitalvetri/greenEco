"use client";

import { useState } from "react";
import { FileDown, FileText, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

type DocType = "invoice" | "proposal" | "closeout" | "po" | "payment-statement";

/**
 * Triggers server-side generation of a document, then opens the durable
 * (storable/shareable) URL. Distinct from the "Print" link, which opens the live
 * HTML view for browser print.
 *
 * `format: "docx"` produces the editable Word version of the SAME document — same
 * renderer, same content — for when the office needs to adjust wording before
 * sending. The PDF stays the one to send.
 */
export function DownloadPdfButton({
  docType,
  docId,
  label = "PDF",
  format = "pdf",
}: {
  docType: DocType;
  docId: string;
  label?: string;
  format?: "pdf" | "docx";
}) {
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docType, docId, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${label} generation failed`);
      window.open(data.url, "_blank", "noopener");
      toast(`${label} ready`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `${label} failed`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
      aria-label={`Download as ${label}`}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : format === "docx" ? (
        <FileText className="size-3.5" />
      ) : (
        <FileDown className="size-3.5" />
      )}
      {loading ? "Generating…" : label}
    </button>
  );
}
