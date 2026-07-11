"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { LEAD_SOURCES } from "@/lib/constants";

interface Member {
  id: string;
  name: string;
}

/**
 * Filter bar for the leads list. Everything lives in the URL so it composes with
 * status tabs and survives the client "Load more" (which reuses the same query).
 * Assignee filter + "My leads" toggle are ADMIN-only — an EMPLOYEE is already
 * hard-scoped to their own leads server-side, so those controls would be no-ops.
 */
export function LeadsFilters({
  members,
  isAdmin,
  currentUserId,
}: {
  members: Member[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const first = useRef(true);

  function apply(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString());
    mut(p);
    startTransition(() => router.push(`/leads${p.toString() ? `?${p}` : ""}`));
  }

  // Debounce the search box → URL (?search=).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      apply((p) => {
        if (search) p.set("search", search);
        else p.delete("search");
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const source = params.get("source") ?? "";
  const assignee = params.get("assignee") ?? "";
  const mine = params.get("assignee") === currentUserId;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, address…"
          aria-label="Search leads"
          className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-sm outline-none focus:border-primary/50"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <select
        value={source}
        onChange={(e) => apply((p) => (e.target.value ? p.set("source", e.target.value) : p.delete("source")))}
        aria-label="Filter by source"
        className="h-9 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-primary/50"
      >
        <option value="">All sources</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {isAdmin && (
        <>
          <select
            value={assignee}
            onChange={(e) =>
              apply((p) => (e.target.value ? p.set("assignee", e.target.value) : p.delete("assignee")))
            }
            aria-label="Filter by owner"
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-primary/50"
          >
            <option value="">All owners</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <button
            onClick={() =>
              apply((p) => (mine ? p.delete("assignee") : p.set("assignee", currentUserId)))
            }
            className={
              "h-9 rounded-lg border px-3 text-sm font-medium " +
              (mine
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted")
            }
          >
            My leads
          </button>
        </>
      )}
    </div>
  );
}
