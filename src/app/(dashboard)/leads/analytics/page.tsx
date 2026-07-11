import Link from "next/link";
import { ArrowLeft, IndianRupee, Target, TrendingUp, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { leadAnalytics } from "@/server/services/lead";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Compact ₹ for KPI tiles — a full ₹1,96,80,000 overflows; ₹1.97 Cr fits. */
function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return formatINR(String(v));
}

export default async function LeadAnalyticsPage() {
  const session = await getSession();
  const a = await leadAnalytics(session);

  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));

  return (
    <div>
      <PageHeader
        title="Lead Analytics"
        subtitle={session.role === "ADMIN" ? "All leads" : "Your leads"}
        action={
          <Link
            href="/leads"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
          >
            <ArrowLeft className="size-4" /> Back to leads
          </Link>
        }
      />

      {a.total === 0 ? (
        <EmptyState icon={Users} title="No leads yet" description="Analytics will populate as you add and work leads." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total leads" value={a.total} icon={Users} tone="primary" />
            <StatTile
              label="Open pipeline (indicative)"
              value={a.openPipelineValue > 0 ? compactINR(a.openPipelineValue) : "—"}
              hint="sell-side estimate"
              icon={IndianRupee}
              tone="ok"
            />
            <StatTile
              label="Win rate"
              value={a.winRatePct != null ? `${a.winRatePct}%` : "—"}
              hint={`${a.won} won · ${a.lost} lost`}
              icon={Target}
              tone={a.winRatePct != null && a.winRatePct >= 50 ? "ok" : "warn"}
            />
            <StatTile label="Open leads" value={a.open} icon={TrendingUp} tone="default" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.funnel.map((f) => (
                  <div key={f.status} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted">{f.status.replace(/_/g, " ")}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                      <div
                        className="h-full rounded bg-primary"
                        style={{ width: `${Math.max(4, (f.count / maxFunnel) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium tabular-nums">{f.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Temperature (open leads)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["HOT", "WARM", "COLD"] as const).map((t) => {
                  const count = a.temperature[t];
                  const pct = a.open > 0 ? Math.round((count / a.open) * 100) : 0;
                  const color = t === "HOT" ? "bg-danger" : t === "WARM" ? "bg-warn" : "bg-muted/40";
                  return (
                    <div key={t} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 text-muted">
                        {t[0] + t.slice(1).toLowerCase()}
                      </span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                        <div className={`h-full rounded ${color}`} style={{ width: `${Math.max(count ? 4 : 0, pct)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                        {count} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Why we lose</CardTitle>
              </CardHeader>
              <CardContent>
                {a.lostByReason.length === 0 ? (
                  <p className="text-sm text-muted">No lost leads yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {a.lostByReason.map((r) => (
                      <li key={r.reason} className="flex justify-between">
                        <span>{r.reason}</span>
                        <span className="font-medium tabular-nums">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By source</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {a.bySource.map((s) => (
                    <li key={s.source} className="flex justify-between gap-3">
                      <span>{s.source}</span>
                      <span className="text-muted tabular-nums">
                        {s.count} · <span className="text-ok">{s.won} won</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By segment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                {a.bySegment.map((s) => (
                  <div key={s.segment} className="flex justify-between gap-3">
                    <span className="truncate">{s.segment}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {s.count} · <span className="text-ok">{s.won}✓</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
