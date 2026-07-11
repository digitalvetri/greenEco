"use client";

import { useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { isSlaBreached } from "@/lib/domain/amc";
import { TicketRow } from "./service-widgets";

export interface TicketListRow {
  id: string;
  ticketNo: string;
  title: string;
  priority: string;
  status: string;
  raisedBy: string;
  slaDueDate: string | null;
}

/** Service-tickets list with cursor "Load more" (SLA breach derived client-side). */
export function TicketsList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: TicketListRow[];
  initialCursor: string | null;
  query: string;
}) {
  const [items, setItems] = useState<TicketListRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("kind", "tickets");
      params.set("cursor", cursor);
      params.set("take", "50");
      const res = await fetch(`/api/service?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: TicketListRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={Ticket} title="No tickets" description="Breakdown & service requests appear here with SLA tracking." />;
  }

  const now = new Date();
  return (
    <div>
      {items.map((t) => (
        <TicketRow
          key={t.id}
          ticket={{
            id: t.id,
            ticketNo: t.ticketNo,
            title: t.title,
            priority: t.priority,
            status: t.status,
            raisedBy: t.raisedBy,
            slaBreached: isSlaBreached(t.slaDueDate ? new Date(t.slaDueDate) : null, t.status === "RESOLVED" || t.status === "CLOSED", now),
          }}
        />
      ))}

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
