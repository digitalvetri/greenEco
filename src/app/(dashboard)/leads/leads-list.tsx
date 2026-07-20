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

/** One customer, aggregated across every enquiry/project they have in the current filter scope. */
export interface LeadCustomerRow {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  email: string | null;
  assignedToName: string;
  projectCount: number;
  statusBreakdown: { status: string; count: number }[];
  urgency: LeadUrgency;
  temperature: "HOT" | "WARM" | "COLD";
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
 * Leads list: Cards (default) show one card per CUSTOMER — grouped server-side by
 * phone (src/server/services/lead.ts listLeadCustomers), so a repeat customer with
 * several enquiries shows once, with a project-count badge, instead of one card per
 * enquiry. Table view (for bulk actions, which operate on individual leads) stays
 * per-lead and lazily fetches its own rows the first time it's opened, so a normal
 * page load doesn't pay for data the user may never look at.
 */
export function LeadsList({
  initialCustomerItems,
  initialCustomerOffset,
  query,
  members = [],
  isAdmin = false,
}: {
  initialCustomerItems: LeadCustomerRow[];
  initialCustomerOffset: number | null;
  /** Serialized filter (status/cold/search/…) to keep pagination on the same view. */
  query: string;
  members?: { id: string; name: string }[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [error, setError] = useState<string | null>(null);

  // Cards (customer-grouped) — server-provided initial page + its own "load more".
  const [customerItems, setCustomerItems] = useState<LeadCustomerRow[]>(initialCustomerItems);
  const [customerOffset, setCustomerOffset] = useState<number | null>(initialCustomerOffset);
  const [customerLoading, setCustomerLoading] = useState(false);

  // Table (per-lead) — lazily fetched the first time this view is opened.
  const [leadItems, setLeadItems] = useState<LeadRow[] | null>(null);
  const [leadCursor, setLeadCursor] = useState<string | null>(null);
  const [leadLoading, setLeadLoading] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startBulk] = useTransition();

  const rows = leadItems ?? [];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = rows.length > 0 && rows.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((l) => l.id)));
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

  async function ensureLeadItemsLoaded() {
    if (leadItems !== null) return;
    setLeadLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("take", "50");
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load leads");
      const data: { items: LeadRow[]; nextCursor: string | null } = await res.json();
      setLeadItems(data.items);
      setLeadCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLeadLoading(false);
    }
  }

  function switchView(v: "cards" | "table") {
    setView(v);
    if (v === "table") void ensureLeadItemsLoaded();
  }

  async function loadMoreCustomers() {
    if (customerOffset === null) return;
    setCustomerLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("offset", String(customerOffset));
      params.set("take", "25");
      const res = await fetch(`/api/leads/customers?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more customers");
      const data: { items: LeadCustomerRow[]; nextOffset: number | null } = await res.json();
      setCustomerItems((prev) => [...prev, ...data.items]);
      setCustomerOffset(data.nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setCustomerLoading(false);
    }
  }

  async function loadMoreLeads() {
    if (!leadCursor) return;
    setLeadLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", leadCursor);
      params.set("take", "50");
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more leads");
      const data: { items: LeadRow[]; nextCursor: string | null } = await res.json();
      setLeadItems((prev) => [...(prev ?? []), ...data.items]);
      setLeadCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLeadLoading(false);
    }
  }

  if (view === "cards" && customerItems.length === 0) {
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
            onClick={() => switchView("cards")}
            aria-label="Card view"
            className={`flex size-8 items-center justify-center ${view === "cards" ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => switchView("table")}
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
        leadLoading && leadItems === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Loading leads…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No leads in this view" description="Try a different filter." />
        ) : (
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
                {rows.map((lead) => (
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
        )
      ) : (
        <div className="space-y-2">
          {customerItems.map((c) => {
            const href = c.projectCount === 1 ? `/leads/${c.id}` : `/leads/customer/${c.id}`;
            return (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={href} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{c.customerName}</span>
                    {c.projectCount > 1 && (
                      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {c.projectCount} Projects
                      </span>
                    )}
                    {c.statusBreakdown.map((s) => (
                      <Badge key={s.status} variant={statusVariant(s.status)}>
                        {s.status.replace(/_/g, " ")}
                        {s.count > 1 ? ` ×${s.count}` : ""}
                      </Badge>
                    ))}
                    {c.temperature !== "COLD" && (
                      <Badge variant={c.temperature === "HOT" ? "danger" : "warn"}>
                        <Flame className="size-3" /> {c.temperature === "HOT" ? "Hot" : "Warm"}
                      </Badge>
                    )}
                    <UrgencyBadge urgency={c.urgency} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{c.address}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3" /> {c.assignedToName}
                    </span>
                    {c.estimatedValue && (
                      <span className="font-semibold text-primary">
                        {c.projectCount > 1 ? "Est. Total Project Value" : "Est. Project Value"} ~₹
                        {(c.estimatedValue.mid / 100000).toFixed(1)}L
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex size-9 items-center justify-center rounded-lg border border-border text-primary"
                    aria-label="Call"
                  >
                    <Phone className="size-4" />
                  </a>
                  <a
                    href={`https://wa.me/91${c.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-9 items-center justify-center rounded-lg border border-border text-ok"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle className="size-4" />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {error && <p className="text-center text-xs text-danger">{error}</p>}

      {((view === "cards" && customerOffset !== null) || (view === "table" && leadCursor)) && (
        <div className="pt-2 text-center">
          <button
            onClick={view === "cards" ? loadMoreCustomers : loadMoreLeads}
            disabled={view === "cards" ? customerLoading : leadLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted disabled:opacity-50"
          >
            {(view === "cards" ? customerLoading : leadLoading) && <Loader2 className="size-4 animate-spin" />}
            {(view === "cards" ? customerLoading : leadLoading) ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
