"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export interface ContractRow {
  id: string;
  contractNo: string;
  clientName: string;
  frequency: string;
  liveStatus: string;
  daysToExpiry: number;
  visitCount: number;
  annualValue?: string;
}

function tone(s: string) {
  if (s === "ACTIVE") return "ok" as const;
  if (s === "EXPIRED") return "danger" as const;
  if (s === "CANCELLED") return "default" as const;
  return "default" as const;
}

/** AMC contracts list with cursor "Load more" — before this the service was unbounded. */
export function ContractsList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: ContractRow[];
  initialCursor: string | null;
  query: string;
}) {
  const [items, setItems] = useState<ContractRow[]>(initialItems);
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
      const res = await fetch(`/api/service?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: ContractRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="No contracts in this view"
        description="Create an AMC from a completed project, or try a different filter."
      />
    );
  }

  return (
    <div className="space-y-1">
      {items.map((c) => (
        <Link key={c.id} href={`/service/${c.id}`} className="block">
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">{c.contractNo}</span>
                <Badge variant={tone(c.liveStatus)}>{c.liveStatus}</Badge>
                {c.liveStatus === "ACTIVE" && c.daysToExpiry <= 60 && (
                  <Badge variant="warn">expires in {c.daysToExpiry}d</Badge>
                )}
              </div>
              <div className="truncate text-sm font-medium">{c.clientName}</div>
              <div className="text-xs text-muted">{c.frequency.replace(/_/g, " ")} · {c.visitCount} visits</div>
            </div>
            {c.annualValue && (
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(c.annualValue)}/yr</span>
            )}
          </div>
        </Link>
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
