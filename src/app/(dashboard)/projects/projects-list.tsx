"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export interface ProjectRow {
  id: string;
  orderNo: string;
  clientName: string;
  siteAddress: string;
  status: string;
  projectValue?: string;
  progress: number;
  nextDue: string | null;
  overdue: boolean;
}

function variant(s: string) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "CANCELLED") return "danger" as const;
  if (s === "ON_HOLD") return "warn" as const;
  return "primary" as const;
}

/** Projects list with cursor "Load more" — before this the service was unbounded. */
export function ProjectsList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: ProjectRow[];
  initialCursor: string | null;
  query: string;
}) {
  const [items, setItems] = useState<ProjectRow[]>(initialItems);
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
      const res = await fetch(`/api/projects?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: ProjectRow[]; nextCursor: string | null } = await res.json();
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
        icon={HardHat}
        title="No projects in this view"
        description="Win a proposal to start a project, or try a different filter."
      />
    );
  }

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((o) => {
          return (
            <Link key={o.id} href={`/projects/${o.id}`}>
              <Card className="p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{o.orderNo}</span>
                  <Badge variant={variant(o.status)}>{o.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-1 truncate font-medium">{o.clientName}</div>
                <div className="truncate text-xs text-muted">{o.siteAddress}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-border">
                  <div className="h-full rounded bg-primary" style={{ width: `${o.progress}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted">{o.progress}% complete</span>
                  <div className="flex items-center gap-2">
                    {o.overdue && <Badge variant="danger">Payment overdue</Badge>}
                    {o.projectValue && <span className="font-semibold tabular-nums">{formatINR(o.projectValue)}</span>}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
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
    </div>
  );
}
