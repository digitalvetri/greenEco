"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";
import { QuickAuditButton } from "./quick-audit-button";

export interface StockRow {
  id: string;
  name: string;
  category: string;
  specification: string | null;
  unit: string;
  total: string;
  byLocation: { location: string; qty: string }[];
  lowStock: boolean;
  purchasePrice?: string; // present only for ADMIN
}

/** Item/stock list with cursor "Load more" — before this the service scanned the whole ledger every request. */
export function StockList({
  initialItems,
  initialCursor,
  query,
  isAdmin,
  locations,
}: {
  initialItems: StockRow[];
  initialCursor: string | null;
  query: string;
  isAdmin: boolean;
  locations: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<StockRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  // Re-sync with the server after a mutation (e.g. QuickAuditButton's router.refresh()) —
  // otherwise this client-cached list keeps showing pre-mutation counts indefinitely,
  // since a plain useState(initialItems) only reads its initial value once.
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
  }, [initialItems, initialCursor]);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      params.set("take", "50");
      const res = await fetch(`/api/materials?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: StockRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={Package} title="No items in this view" description="Add an item, or try a different search / category." />;
  }

  return (
    <div>
      <Table>
        <THead>
          <TR className="border-t-0">
            <TH>Item</TH>
            <TH>Cat</TH>
            <TH className="text-right">Total</TH>
            <TH>Split by location</TH>
            {isAdmin && <TH className="text-right">Purch. ₹</TH>}
            {isAdmin && <TH className="text-right">Incl. GST</TH>}
          </TR>
        </THead>
        <TBody>
          {items.map((i) => (
            <TR key={i.id}>
              <TD>
                <div className="flex items-center gap-1.5">
                  <Link href={`/materials/${i.id}`} className="font-medium text-primary hover:underline">
                    {i.name}
                  </Link>
                  {i.lowStock && <Badge variant="danger">low</Badge>}
                  {isAdmin && (
                    <QuickAuditButton
                      itemId={i.id}
                      itemName={i.name}
                      unit={i.unit}
                      locations={locations}
                      currentByLocation={i.byLocation}
                    />
                  )}
                </div>
                {i.specification && <div className="truncate text-xs text-muted">{i.specification}</div>}
              </TD>
              <TD className="text-xs text-muted">{i.category}</TD>
              <TD className="whitespace-nowrap text-right font-medium tabular-nums">
                {i.total} <span className="text-xs text-muted">{i.unit}</span>
              </TD>
              <TD className="whitespace-nowrap text-xs text-muted">
                {i.byLocation.length === 0 ? "—" : i.byLocation.map((b) => `${b.location}: ${b.qty}`).join(" · ")}
              </TD>
              {isAdmin && (
                <TD className="text-right tabular-nums">
                  {i.purchasePrice ? formatINR(i.purchasePrice) : "—"}
                </TD>
              )}
              {isAdmin && (
                <TD className="text-right tabular-nums text-muted">
                  {i.purchasePrice ? formatINR((Number(i.purchasePrice) * 1.18).toFixed(2)) : "—"}
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>

      {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
      {cursor && (
        <div className="pt-3 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {!isAdmin && <p className="mt-2 text-xs text-muted">Purchase prices are hidden for field staff.</p>}
    </div>
  );
}
