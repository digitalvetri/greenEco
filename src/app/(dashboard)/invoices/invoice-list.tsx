"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt, FileCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/money";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { issueDraftInvoiceAction } from "./actions";

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  taxType: string;
  total: string;
  date: string;
  isCreditNote: boolean;
  status: string;
}

/** Invoice list with cursor "Load more" — before this the service was cap-200, cursorless. */
export function InvoiceList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: InvoiceRow[];
  initialCursor: string | null;
  query: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<InvoiceRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuing, startIssue] = useTransition();

  function issue(id: string) {
    startIssue(async () => {
      const r = await issueDraftInvoiceAction(id);
      if (r.ok) {
        toast(`Issued ${r.invoiceNo}`);
        router.refresh();
      } else toast(r.error ?? "Failed to issue", "error");
    });
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      params.set("take", "50");
      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: InvoiceRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={Receipt} title="No invoices in this view" description="Raise an invoice from a project milestone, or try a different search." />;
  }

  return (
    <div className="space-y-2">
      {items.map((inv) => (
        <Card key={inv.id} className="flex items-center justify-between gap-3 p-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{inv.status === "DRAFT" ? "Draft (auto)" : inv.invoiceNo}</span>
              {inv.status === "DRAFT" && <Badge variant="warn">Draft</Badge>}
              {inv.isCreditNote && <Badge variant="danger">Credit</Badge>}
              <Badge variant="default">{inv.taxType}</Badge>
            </div>
            <div className="text-xs text-muted">{new Date(inv.date).toLocaleDateString("en-IN")}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className={"font-semibold tabular-nums " + (inv.isCreditNote ? "text-danger" : "")}>{formatINR(inv.total)}</span>
            {inv.status === "DRAFT" ? (
              <Button size="sm" onClick={() => issue(inv.id)} loading={issuing} title="Assign a real invoice number">
                <FileCheck className="size-4" /> Issue
              </Button>
            ) : (
              <>
                <a href={`/print/invoice/${inv.invoiceNo}`} target="_blank" rel="noreferrer" className="text-xs text-primary">Print</a>
                <DownloadPdfButton docType="invoice" docId={inv.invoiceNo} />
              </>
            )}
          </div>
        </Card>
      ))}

      {error && <p className="text-center text-xs text-danger">{error}</p>}
      {cursor && (
        <div className="pt-2 text-center">
          <button onClick={loadMore} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted disabled:opacity-50">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
