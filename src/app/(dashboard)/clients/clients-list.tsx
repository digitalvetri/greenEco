"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface ClientRow {
  id: string;
  customerName: string;
  phone: string;
  address: string | null;
  proposalNo: string | null;
  orderNo: string | null;
}

/** Clients list with cursor "Load more" — before this the service was unbounded. */
export function ClientsList({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: ClientRow[];
  initialCursor: string | null;
  query: string;
}) {
  const [items, setItems] = useState<ClientRow[]>(initialItems);
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
      const res = await fetch(`/api/clients?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: ClientRow[]; nextCursor: string | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={Users} title="No clients in this view" description="Clients appear once a lead has a proposal, or try a different search." />;
  }

  return (
    <div className="space-y-2">
      {items.map((c) => (
        <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
          <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{c.customerName}</span>
              {c.orderNo && <Badge variant="ok">{c.orderNo}</Badge>}
              {!c.orderNo && c.proposalNo && <Badge variant="primary">{c.proposalNo}</Badge>}
            </div>
            <div className="truncate text-xs text-muted">{c.address}</div>
          </Link>
          <div className="flex shrink-0 gap-1">
            <a href={`tel:${c.phone}`} aria-label={`Call ${c.customerName}`} className="flex size-9 items-center justify-center rounded-lg border border-border text-primary">
              <Phone className="size-4" />
            </a>
            <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.customerName}`} className="flex size-9 items-center justify-center rounded-lg border border-border text-ok">
              <MessageCircle className="size-4" />
            </a>
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
