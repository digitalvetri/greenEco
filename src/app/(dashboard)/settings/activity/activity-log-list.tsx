"use client";

import { useState, useTransition } from "react";
import { LogIn, Plus, Pencil, Trash2, Eye, CheckCircle2, Download, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditAction } from "@/lib/audit";
import type { AuditLogRow } from "@/server/services/user-admin";

const ACTION_META: Record<AuditAction, { label: string; icon: typeof LogIn; variant: "ok" | "primary" | "danger" | "warn" | "default" }> = {
  LOGIN: { label: "Signed in", icon: LogIn, variant: "ok" },
  CREATE: { label: "Created", icon: Plus, variant: "primary" },
  UPDATE: { label: "Updated", icon: Pencil, variant: "default" },
  DELETE: { label: "Deleted", icon: Trash2, variant: "danger" },
  VIEW_PRICE: { label: "Viewed price", icon: Eye, variant: "warn" },
  APPROVE: { label: "Approved", icon: CheckCircle2, variant: "ok" },
  EXPORT: { label: "Exported", icon: Download, variant: "default" },
};

const ACTIONS: AuditAction[] = ["LOGIN", "CREATE", "UPDATE", "DELETE", "VIEW_PRICE", "APPROVE", "EXPORT"];

export function ActivityLogList({
  initialItems,
  initialCursor,
}: {
  initialItems: AuditLogRow[];
  initialCursor: string | null;
}) {
  const [action, setAction] = useState<AuditAction | "">("");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, start] = useTransition();

  function applyFilter(next: AuditAction | "") {
    setAction(next);
    start(async () => {
      const q = next ? `?action=${next}` : "";
      const res = await fetch(`/api/settings/activity${q}`);
      const data = await res.json();
      setItems(data.items);
      setCursor(data.nextCursor);
    });
  }

  function loadMore() {
    start(async () => {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/settings/activity?${params.toString()}`);
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    });
  }

  return (
    <div className="space-y-4">
      <Select
        aria-label="Filter by action"
        value={action}
        onChange={(e) => applyFilter(e.target.value as AuditAction | "")}
        className="w-56"
      >
        <option value="">All activity</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {ACTION_META[a].label}
          </option>
        ))}
      </Select>

      {items.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Mutations and sign-ins will appear here as they happen." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {items.map((row) => {
              const meta = ACTION_META[row.action];
              const Icon = meta.icon;
              return (
                <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{row.userName}</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-muted">{row.entity}</span>
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-muted" dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
              );
            })}
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
