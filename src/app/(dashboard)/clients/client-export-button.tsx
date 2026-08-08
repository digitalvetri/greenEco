"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportRows } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { exportAllClientsAction } from "./actions";

/** Downloads client details + their project details (all matching the current search, not just the visible page). */
export function ClientExportButton({ search }: { search?: string }) {
  const [exporting, setExporting] = useState(false);

  async function exportAll() {
    setExporting(true);
    try {
      const rows = await exportAllClientsAction(search);
      exportRows(
        rows.length
          ? rows
          : [{ customerName: "", phone: "", address: "", projectName: "", plantType: "", technology: "", capacityKLD: "", proposalNo: "", orderNo: "", orderStatus: "", projectValue: "" }],
        "clients",
      );
      toast(`Exported ${rows.length} project${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast("Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={exporting} onClick={exportAll}>
      <Download className="size-4" /> {exporting ? "Exporting…" : "Excel"}
    </Button>
  );
}
