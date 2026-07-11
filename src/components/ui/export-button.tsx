"use client";

import { Download } from "lucide-react";
import { exportRows } from "@/lib/excel";
import { Button } from "./button";

export function ExportButton({
  rows,
  filename,
  label = "Export Excel",
}: {
  rows: Record<string, unknown>[];
  filename: string;
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={() => exportRows(rows, filename)} disabled={!rows.length}>
      <Download className="size-4" /> {label}
    </Button>
  );
}
