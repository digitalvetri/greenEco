"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

/**
 * Triggers server-side PDF generation for a document, then opens the durable
 * (storable/shareable) PDF URL. Distinct from the "Print" link, which opens the
 * live HTML view for browser print.
 */
export function DownloadPdfButton({
  docType,
  docId,
  label = "PDF",
}: {
  docType: "invoice" | "proposal" | "closeout";
  docId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docType, docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PDF generation failed");
      window.open(data.url, "_blank", "noopener");
      toast("PDF ready");
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
      aria-label={`Download ${label} PDF`}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      {loading ? "Generating…" : label}
    </button>
  );
}
