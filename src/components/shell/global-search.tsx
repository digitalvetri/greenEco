"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, FileText, HardHat, Boxes, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const ICON: Record<string, typeof Users> = {
  Lead: Users,
  Proposal: FileText,
  Project: HardHat,
  Item: Boxes,
  Invoice: Receipt,
};

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.hits ?? []);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Search className="size-4 text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter" && hits[active]) go(hits[active]);
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {loading ? (
          <Loader2 className="size-3.5 animate-spin text-muted" />
        ) : (
          <kbd className="hidden rounded border border-border px-1 text-[10px] text-muted sm:block">⌘K</kbd>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1.5 w-[min(90vw,26rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {hits.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">{loading ? "Searching…" : "No results"}</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((h, i) => {
                const Icon = ICON[h.type] ?? Search;
                return (
                  <li key={`${h.type}-${h.id}`}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                        i === active ? "bg-primary-50" : "hover:bg-surface",
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        <span className="block truncate text-xs text-muted">{h.subtitle}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-muted">{h.type}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
