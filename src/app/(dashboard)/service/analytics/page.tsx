import Link from "next/link";
import { ArrowLeft, FileCheck2, IndianRupee, CalendarCheck, ShieldAlert, RefreshCw, LifeBuoy } from "lucide-react";
import { getSession } from "@/lib/auth";
import { amcAnalytics } from "@/server/services/amc";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function AmcAnalyticsPage() {
  const session = await getSession();
  const a = await amcAnalytics(session);
  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));
  const maxFreq = Math.max(1, ...a.byFrequency.map((f) => f.count));

  return (
    <div>
      <PageHeader
        title="Service / AMC Analytics"
        action={
          <Link href="/service" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to service
          </Link>
        }
      />

      {a.totalContracts === 0 ? (
        <EmptyState icon={LifeBuoy} title="No contracts yet" description="Analytics populate as AMC contracts run." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Active contracts"
              value={a.active}
              hint={`${a.expiringPipeline} expiring ≤90d`}
              icon={FileCheck2}
              tone="primary"
            />
            <StatTile
              label="Recurring revenue"
              value={a.recurringRevenue != null ? (a.recurringRevenue > 0 ? compactINR(a.recurringRevenue) : "—") : "—"}
              hint={a.recurringRevenue != null ? "annual run-rate" : "admin only"}
              icon={IndianRupee}
              tone="ok"
            />
            <StatTile
              label="Visit compliance"
              value={a.visitCompliancePct != null ? `${a.visitCompliancePct}%` : "—"}
              hint={`${a.visitsDone} done · ${a.visitsMissed} missed`}
              icon={CalendarCheck}
              tone={a.visitCompliancePct != null && a.visitCompliancePct >= 80 ? "ok" : "warn"}
            />
            <StatTile
              label="SLA breach"
              value={a.slaBreachPct != null ? `${a.slaBreachPct}%` : "—"}
              hint={`${a.ticketsBreached} of ${a.ticketsTotal} tickets`}
              icon={ShieldAlert}
              tone={a.slaBreachPct != null && a.slaBreachPct > 0 ? "danger" : "default"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Renewal rate"
              value={a.renewalRatePct != null ? `${a.renewalRatePct}%` : "—"}
              hint={a.renewalRatePct != null ? `${a.renewedContracts} of ${a.expiredContracts} lapsed` : "no lapsed contracts yet"}
              icon={RefreshCw}
              tone={a.renewalRatePct != null && a.renewalRatePct >= 70 ? "ok" : a.renewalRatePct != null ? "warn" : "default"}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.funnel.map((f) => (
                  <div key={f.status} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted">{f.status}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                      <div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, (f.count / maxFunnel) * 100)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium tabular-nums">{f.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active by frequency</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.byFrequency.length === 0 ? (
                  <p className="text-sm text-muted">No active contracts.</p>
                ) : (
                  a.byFrequency.map((f) => (
                    <div key={f.frequency} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 text-muted">{f.frequency.replace(/_/g, " ")}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                        <div className="h-full rounded bg-primary/70" style={{ width: `${Math.max(4, (f.count / maxFreq) * 100)}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right font-medium tabular-nums">{f.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
