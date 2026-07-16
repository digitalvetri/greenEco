"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, MessageCircle, Loader2, User, AlertTriangle, Clock, Users, Flame, LayoutGrid, Table2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { bulkAssignAction, bulkSetStatusAction } from "./actions";

const BULK_STATUSES = ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED", "ON_HOLD"];

export type LeadUrgency = { kind: "overdue" | "no-date" | "stale-new"; label: string } | null;

export interface LeadRow {
  id: string;
  customerName: string;
  status: string;
  source: string;
  address: string;
  phone: string;
  assignedToName: string;
  urgency: LeadUrgency;
  temperature: "HOT" | "WARM" | "COLD";
  followUps: { nextDate: string | Date | null }[];
  estimatedValue?: { low: number; mid: number; high: number } | null;
}

function statusVariant(s: string) {
  if (s === "CONVERTED") return "ok" as const;
  if (s === "LOST") return "danger" as const;
  if (s === "ON_HOLD") return "warn" as const;
  return "primary" as const;
}

/** Urgency badge — colour + icon + text (never colour alone, WCAG 1.4.1). */
function UrgencyBadge({ urgency }: { urgency: LeadUrgency }) {
  if (!urgency) return null;
  const variant = urgency.kind === "overdue" ? "danger" : "warn";
  const Icon = urgency.kind === "overdue" ? AlertTriangle : Clock;
  return (
    <Badge variant={variant}>
      <Icon className="size-3" /> {urgency.label}
    </Badge>
  );
}

/**
 * Client lead list with cursor-based "Load more" — before this, the list was
 * hard-capped at 50 rows and leads beyond that were unreachable (the service
 * already returned nextCursor; the UI just ignored it).
 */
export function LeadsList({
  initialItems,
  initialCursor,
  query,
  members = [],
  isAdmin = false,
}: {
  initialItems: LeadRow[];
  initialCursor: string | null;
  /** Serialized filter (status/cold) to keep pagination on the same view. */
  query: string;
  members?: { id: string; name: string }[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LeadRow[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startBulk] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((l) => l.id)));
  const clearSel = () => setSelected(new Set());

  function runBulk(fn: () => Promise<{ updated: number }>) {
    startBulk(async () => {
      try {
        const r = await fn();
        toast(`Updated ${r.updated} lead${r.updated === 1 ? "" : "s"}`);
        clearSel();
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Bulk action failed", "error");
      }
    });
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      params.set("take", "50");
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more leads");
      const data: { items: LeadRow[]; nextCursor: string | null } = await res.json();
      setItems((prev) => [...prev, ...data.items]);
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
        icon={Users}
        title="No leads in this view"
        description="Try a different filter, or add a new lead to get started."
      />
    );
  }

  const selCount = selected.size;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">{view === "table" ? "Select rows for bulk actions" : ""}</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          <button
            onClick={() => setView("cards")}
            aria-label="Card view"
            className={`flex size-8 items-center justify-center ${view === "cards" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView("table")}
            aria-label="Table view"
            className={`flex size-8 items-center justify-center ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            <Table2 className="size-4" />
          </button>
        </div>
      </div>

      {view === "table" && selCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-sm">
          <span className="font-medium">{selCount} selected</span>
          {isAdmin && (
            <select
              aria-label="Bulk assign owner"
              defaultValue=""
              disabled={busy}
              onChange={(e) => e.target.value && runBulk(() => bulkAssignAction([...selected], e.target.value))}
              className="h-8 rounded-lg border border-border bg-card px-2 text-sm"
            >
              <option value="">Assign to…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Bulk set status"
            defaultValue=""
            disabled={busy}
            onChange={(e) => e.target.value && runBulk(() => bulkSetStatusAction([...selected], e.target.value))}
            className="h-8 rounded-lg border border-border bg-card px-2 text-sm"
          >
            <option value="">Set status…</option>
            {BULK_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          {busy && <Loader2 className="size-4 animate-spin text-muted" />}
          <button onClick={clearSel} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <X className="size-3" /> Clear
          </button>
        </div>
      )}

      {view === "table" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface text-left text-xs text-muted">
              <tr>
                <th className="w-9 p-2">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="p-2">Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Temp</th>
                <th className="p-2">Owner</th>
                <th className="p-2">Next</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-surface/60">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.customerName}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                    />
                  </td>
                  <td className="p-2">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                      {lead.customerName}
                    </Link>
                  </td>
                  <td className="p-2">
                    <Badge variant={statusVariant(lead.status)}>{lead.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="p-2 text-muted">{lead.temperature[0] + lead.temperature.slice(1).toLowerCase()}</td>
                  <td className="p-2 text-muted">{lead.assignedToName}</td>
                  <td className="p-2 text-muted">
                    {lead.followUps[0]?.nextDate ? new Date(lead.followUps[0].nextDate).toLocaleDateString("en-IN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="space-y-4">
      {(() => {
        // Group leads by customerName
        const groups = new Map<string, LeadRow[]>();
        for (const lead of items) {
          const key = lead.customerName;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(lead);
        }
        return [...groups.entries()].map(([customer, leads]) => (
          <div key={customer}>
            {groups.size > 1 && (
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">{customer}</span>
                {leads.length > 1 && (
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {leads.length} enquiries
                  </span>
                )}
              </div>
            )}
            <div className="space-y-2">
              {leads.map((lead) => (
                <Card key={lead.id} className="flex items-center justify-between gap-3 p-3">
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{lead.customerName}</span>
                      <Badge variant={statusVariant(lead.status)}>{lead.status.replace(/_/g, " ")}</Badge>
                      {lead.temperature !== "COLD" && lead.status !== "CONVERTED" && lead.status !== "LOST" && (
                        <Badge variant={lead.temperature === "HOT" ? "danger" : "warn"}>
                          <Flame className="size-3" /> {lead.temperature === "HOT" ? "Hot" : "Warm"}
                        </Badge>
                      )}
                      <UrgencyBadge urgency={lead.urgency} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {lead.source} · {lead.address}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3" /> {lead.assignedToName}
                      </span>
                      {lead.followUps[0]?.nextDate && (
                        <span>Next: {new Date(lead.followUps[0].nextDate).toLocaleDateString("en-IN")}</span>
                      )}
                      {lead.estimatedValue && (
                        <span className="font-semibold text-primary">
                          Est. Project Value ~₹{(lead.estimatedValue.mid / 100000).toFixed(1)}L
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex size-9 items-center justify-center rounded-lg border border-border text-primary"
                      aria-label="Call"
                    >
                      <Phone className="size-4" />
                    </a>
                    <a
                      href={`https://wa.me/91${lead.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-lg border border-border text-ok"
                      aria-label="WhatsApp"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ));
      })()}
      </div>
      )}

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
