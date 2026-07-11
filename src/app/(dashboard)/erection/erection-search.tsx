"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/** Debounced search box for the entry list — URL-driven, composes with type/status tabs. */
export function ErectionSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(params.get("search") ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (q) p.set("search", q);
      else p.delete("search");
      start(() => router.push(`/erection${p.toString() ? `?${p}` : ""}`));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative mb-3 max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search description, gang/shop, project…"
        aria-label="Search entries"
        className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-sm outline-none focus:border-primary/50"
      />
      {q && (
        <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
