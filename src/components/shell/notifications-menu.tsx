"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { markNotificationReadAction } from "@/app/(dashboard)/notifications/actions";

interface Notif {
  id: string;
  kind: string;
  label: string;
  detail: string;
  href: string;
  tone: "primary" | "warn" | "danger";
}

const DOT = { primary: "bg-primary", warn: "bg-warn", danger: "bg-danger" };

const POLL_MS = 30_000;

export function NotificationsMenu({ items, unreadCount }: { items: Notif[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unreadCount);
  const [list, setList] = useState(items);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Live-updating badge — no WebSocket infra in this app, so a light poll (matches the
  // codebase's existing pattern of light client polling over a persistent connection).
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/notifications/unread-count")
        .then((r) => r.json())
        .then((d) => setCount(d.count))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  function onItemClick(id: string) {
    setList((l) => l.filter((n) => n.id !== id));
    setCount((c) => Math.max(0, c - 1));
    markNotificationReadAction(id).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications (${count})`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <Bell className="size-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-card">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-semibold">
            Notifications
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
              <BellOff className="size-6 text-muted/50" />
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {list.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      setOpen(false);
                      onItemClick(n.id);
                    }}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface"
                  >
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
