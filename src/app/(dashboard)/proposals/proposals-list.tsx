"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, AlertTriangle, Clock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export type ProposalExpiry = { state: "active" | "expiring" | "expired"; daysLeft: number } | null;

export interface ProposalRow {
  id: string;
  number: string;
  status: string;
  projectName: string;
  plantType: string;
  technology: string;
  capacityKLD: number;
  grandTotal: string | null;
  aiGenerated: boolean;
  orderNo: string | null;
  expiry: ProposalExpiry;
}

function variant(s: string) {
  if (s === "WON") return "ok" as const;
  if (s === "LOST" || s === "EXPIRED") return "danger" as const;
  if (s === "DRAFT") return "default" as const;
  return "primary" as const;
}

function ExpiryBadge({ expiry }: { expiry: ProposalExpiry }) {
  if (!expiry || expiry.state === "active") return null;
  const overdue = expiry.state === "expired";
  const Icon = overdue ? AlertTriangle : Clock;
  return (
    <Badge variant={overdue ? "danger" : "warn"}>
      <Icon className="size-3" /> {overdue ? `Expired ${-expiry.daysLeft}d` : `Expires ${expiry.daysLeft}d`}
    </Badge>
  );
}

/** Proposals list with cursor "Load more" — before this the service capped at 100. */
export function ProposalsList({
  initialItems,
  initialCursor,
  query,
  isAdmin,
}: {
  initialItems: ProposalRow[];
  initialCursor: string | null;
  query: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<ProposalRow[]>(initialItems);
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
      const res = await fetch(`/api/proposals?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: ProposalRow[]; nextCursor: string | null } = await res.json();
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
        icon={FileText}
        title="No proposals in this view"
        description="Convert a lead to create one, or try a different filter."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3 p-3 transition-colors hover:border-primary/40">
          <Link href={`/proposals/${p.id}`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{p.number}</span>
              <Badge variant={variant(p.status)}>{p.status.replace(/_/g, " ")}</Badge>
              {p.aiGenerated && (
                <Badge variant="review">
                  <Sparkles className="size-3" /> AI
                </Badge>
              )}
              <ExpiryBadge expiry={p.expiry} />
            </div>
            <div className="mt-0.5 truncate font-medium">{p.projectName}</div>
            <div className="text-xs text-muted">
              {p.plantType} · {p.technology} · {p.capacityKLD} KLD
            </div>
          </Link>
          <div className="shrink-0 text-right">
            {p.grandTotal && <div className="font-semibold tabular-nums">{formatINR(p.grandTotal)}</div>}
            {p.orderNo && <div className="text-[11px] text-ok">→ {p.orderNo}</div>}
            {!isAdmin && <div className="text-[10px] text-muted">sell price</div>}
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
