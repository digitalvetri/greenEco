"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";
import { InvoicePanel } from "./invoice-panel";

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
  const [panelId, setPanelId] = useState<string | null>(null);

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
        <Card
          key={inv.id}
          interactive
          className="flex cursor-pointer items-center justify-between gap-3 p-3"
          onClick={() => setPanelId(inv.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPanelId(inv.id)}
        >
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
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Eye className="size-3.5" /> View
            </span>
          </div>
        </Card>
      ))}

      <InvoicePanel
        invoiceId={panelId}
        open={panelId !== null}
        onClose={() => setPanelId(null)}
        onChanged={() => router.refresh()}
      />

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
