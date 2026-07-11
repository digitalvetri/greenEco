"use client";

import { useState } from "react";
import { Loader2, HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export interface EntryRow {
  id: string;
  type: string;
  description: string;
  amount: string;
  status: string;
  orderNo: string;
  clientName: string;
}

function statusTone(s: string) {
  if (s === "APPROVED") return "ok" as const;
  if (s === "REJECTED") return "danger" as const;
  if (s === "QUERIED") return "warn" as const;
  return "default" as const;
}

/** Erection entry list with cursor "Load more" — before this the service was unbounded. */
export function EntryList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: EntryRow[];
  initialCursor: string | null;
  query: string;
}) {
  const [items, setItems] = useState<EntryRow[]>(initialItems);
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
      const res = await fetch(`/api/erection?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: EntryRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={HardHat} title="No entries in this view" description="Log site labour or a purchase, or try a different filter." />;
  }

  return (
    <div className="space-y-2">
      {items.map((e) => (
        <Card key={e.id} className="flex items-center justify-between p-3 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">{e.type.replace(/_/g, " ")}</Badge>
              <span className="font-mono text-xs text-muted">{e.orderNo}</span>
            </div>
            <div className="mt-0.5">{e.description}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">{formatINR(e.amount)}</div>
            <Badge variant={statusTone(e.status)}>{e.status}</Badge>
          </div>
        </Card>
      ))}

      {error && <p className="text-center text-xs text-danger">{error}</p>}
      {cursor && (
        <div className="pt-2 text-center">
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
    </div>
  );
}
