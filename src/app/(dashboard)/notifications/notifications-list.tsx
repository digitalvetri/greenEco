"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { NotificationItem } from "@/server/services/notifications";
import { markNotificationReadAction, markAllNotificationsReadAction, dismissNotificationAction } from "./actions";

export function NotificationsList({
  initialItems,
  initialCursor,
}: {
  initialItems: NotificationItem[];
  initialCursor: string | null;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, start] = useTransition();

  function applyFilter(next: "all" | "unread") {
    setFilter(next);
    start(async () => {
      const q = next === "unread" ? "?unread=1" : "";
      const res = await fetch(`/api/notifications${q}`);
      const data = await res.json();
      setItems(data.items);
      setCursor(data.nextCursor);
    });
  }

  function loadMore() {
    start(async () => {
      const params = new URLSearchParams();
      if (filter === "unread") params.set("unread", "1");
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/notifications?${params.toString()}`);
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    });
  }

  function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationReadAction(id).catch(() => toast("Could not mark as read", "error"));
  }

  function dismiss(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    dismissNotificationAction(id).catch(() => toast("Could not dismiss", "error"));
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsReadAction()
      .then(() => toast("All caught up"))
      .catch(() => toast("Could not mark all as read", "error"));
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select aria-label="Filter" value={filter} onChange={(e) => applyFilter(e.target.value as "all" | "unread")} className="w-40">
          <option value="all">All</option>
          <option value="unread">Unread</option>
        </Select>
        <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={markAllRead}>
          <CheckCheck className="size-4" /> Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="Nothing needs your attention right now." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {items.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${n.read ? "opacity-60" : ""}`}>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                <Link
                  href={n.href}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`min-w-0 flex-1 ${n.read ? "" : "-ml-1"}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{n.label}</span>
                    <Badge variant={n.tone}>{n.detail}</Badge>
                  </div>
                  <time className="text-xs text-muted" dateTime={n.createdAt}>
                    {new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </Link>
                <button
                  type="button"
                  aria-label={`Dismiss: ${n.label}`}
                  onClick={() => dismiss(n.id)}
                  className="shrink-0 rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} loading={pending}>
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
