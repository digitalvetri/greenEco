"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export interface StockRow {
  id: string;
  name: string;
  category: string;
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
}: {
  initialItems: StockRow[];
  initialCursor: string | null;
  query: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<StockRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2">Item</th>
              <th className="pb-2">Cat</th>
              <th className="pb-2 pr-6 text-right">Total</th>
              <th className="pb-2 pl-2">Split by location</th>
              {isAdmin && <th className="pb-2 text-right">Purch. ₹</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/materials/${i.id}`} className="font-medium text-primary hover:underline">
                      {i.name}
                    </Link>
                    {i.lowStock && <Badge variant="danger">low</Badge>}
                  </div>
                </td>
                <td className="py-1.5 text-xs text-muted">{i.category}</td>
                <td className="whitespace-nowrap py-2 pr-6 text-right font-medium tabular-nums">
                  {i.total} <span className="text-xs text-muted">{i.unit}</span>
                </td>
                <td className="py-2 pl-2 text-xs text-muted">
                  {i.byLocation.length === 0 ? "—" : i.byLocation.map((b) => `${b.location}: ${b.qty}`).join(" · ")}
                </td>
                {isAdmin && (
                  <td className="py-1.5 text-right tabular-nums">
                    {i.purchasePrice ? formatINR(i.purchasePrice) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
