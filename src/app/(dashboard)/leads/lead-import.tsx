"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download } from "lucide-react";
import { parseSheet, exportRows } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { importLeadsAction, exportAllLeadsAction } from "./actions";

export interface ExportFilters {
  status?: string;
  source?: string;
  assignee?: string;
  cold?: boolean;
  search?: string;
}

/**
 * Excel lead import/export (spec §Phase 1 DoD + §9). Export pulls ALL leads
 * matching the current filters (not just the visible page). Template columns:
 * customerName, address, phone, email, source, status, requirement, owner.
 */
export function LeadImportExport({ filters }: { filters: ExportFilters }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    const rows = await parseSheet(file);
    start(async () => {
      const res = await importLeadsAction(rows as Record<string, unknown>[]);
      setMsg(`Imported ${res.created}${res.failed ? `, ${res.failed} skipped` : ""}`);
      router.refresh();
    });
  }

  async function exportAll() {
    setExporting(true);
    try {
      const rows = await exportAllLeadsAction(filters);
      exportRows(
        rows.length
          ? rows
          : [{ customerName: "", address: "", phone: "", email: "", source: "Reference", status: "", requirement: "", owner: "" }],
        "leads",
      );
      toast(`Exported ${rows.length} lead${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast("Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ok">{msg}</span>}
      <Button variant="outline" size="sm" disabled={exporting} onClick={exportAll}>
        <Download className="size-4" /> {exporting ? "Exporting…" : "Excel"}
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => ref.current?.click()}>
        <Upload className="size-4" /> {pending ? "Importing…" : "Import"}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}
