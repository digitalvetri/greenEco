"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notif {
  kind: string;
  label: string;
  detail: string;
  href: string;
  tone: "primary" | "warn" | "danger";
}

const DOT = { primary: "bg-primary", warn: "bg-warn", danger: "bg-danger" };

export function NotificationsMenu({ items }: { items: Notif[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications (${items.length})`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <Bell className="size-[18px]" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-card">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Notifications</div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
              <BellOff className="size-6 text-muted/50" />
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((n, i) => (
                <li key={i}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[n.tone])} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.label}</span>
                      <span className="block text-xs text-muted">{n.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
