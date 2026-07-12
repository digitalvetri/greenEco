"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { toggleAutomationAction, runDryRunAction } from "./actions";
import type { AutomationOverviewItem } from "@/server/services/automation-admin";
import type { AutomationResult } from "@/server/automations/types";

export function AutomationsTable({ items }: { items: AutomationOverviewItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ name: string; data: AutomationResult } | null>(null);

  function toggle(id: string, next: boolean) {
    start(async () => {
      const r = await toggleAutomationAction(id, next);
      if (r.ok) {
        toast(next ? "Automation enabled" : "Automation disabled");
        router.refresh();
      } else toast(r.error ?? "Failed", "error");
    });
  }

  function dryRun(name: string) {
    start(async () => {
      const r = await runDryRunAction(name);
      if (r.ok && r.result) {
        setResult({ name, data: r.result });
        toast(`Dry run: ${r.result.sent} would send, ${r.result.skipped} skipped`);
      } else toast(r.error ?? "Failed", "error");
    });
  }

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {a.id}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{a.label}</span>
                {a.schedule ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                    <Clock className="size-3" /> {a.schedule}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                    <Zap className="size-3" /> event-driven
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                <code>{a.name}</code>
                {a.lastRun ? ` · last ${a.lastRun.status.toLowerCase()} ${new Date(a.lastRun.at).toLocaleString("en-IN")}` : " · never run"}
              </div>
            </div>

            <Button size="sm" variant="outline" onClick={() => dryRun(a.name)} disabled={pending} title="Run now (dry run — sends nothing)">
              <Play className="size-3.5" /> Dry run
            </Button>

            <button
              type="button"
              role="switch"
              aria-checked={a.enabled}
              aria-label={`${a.enabled ? "Disable" : "Enable"} ${a.label}`}
              disabled={pending}
              onClick={() => toggle(a.id, !a.enabled)}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                (a.enabled ? "bg-primary" : "bg-border")
              }
            >
              <span className={"absolute top-0.5 size-5 rounded-full bg-white shadow transition-all " + (a.enabled ? "left-[22px]" : "left-0.5")} />
            </button>
          </div>

          {result?.name === a.name && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface p-2 text-[11px] text-muted">
              {JSON.stringify(result.data.details, null, 2)}
            </pre>
          )}
        </div>
      ))}
      {items.length === 0 && <Badge variant="default">No automations registered yet</Badge>}
    </div>
  );
}
