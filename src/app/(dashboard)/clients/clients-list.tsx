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
  projectCount: number;
  proposalNo: string | null;
  orderNo: string | null;
}

/**
 * Clients list, one card per CUSTOMER — grouped server-side by phone (see
 * listClientCustomers in client.ts), so a repeat customer with several projects
 * shows once, with a project-count badge, instead of one card per project. Their
 * card links to their most recent project's Client 360, which shows a tab strip for
 * the others when there's more than one.
 */
export function ClientsList({
  initialItems,
  initialOffset,
  query,
}: {
  initialItems: ClientRow[];
  initialOffset: number | null;
  query: string;
}) {
  const [items, setItems] = useState<ClientRow[]>(initialItems);
  const [offset, setOffset] = useState<number | null>(initialOffset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (offset === null) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("offset", String(offset));
      params.set("take", "25");
      const res = await fetch(`/api/clients/customers?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: ClientRow[]; nextOffset: number | null } = await res.json();
      setItems((p) => [...p, ...data.items]);
      setOffset(data.nextOffset);
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
        <Card key={c.phone} className="flex items-center justify-between gap-3 p-3">
          <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{c.customerName}</span>
              {c.projectCount > 1 && (
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  {c.projectCount} Projects
                </span>
              )}
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
      {offset !== null && (
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
