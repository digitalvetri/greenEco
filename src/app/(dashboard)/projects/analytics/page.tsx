import Link from "next/link";
import { ArrowLeft, HardHat, IndianRupee, TrendingUp, AlarmClock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { projectAnalytics } from "@/server/services/order";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ProjectAnalyticsPage() {
  const session = await getSession();
  const a = await projectAnalytics(session);
  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));
  const onTimePct = a.doneStages > 0 ? Math.round(((a.doneStages - a.delayedStages) / a.doneStages) * 100) : null;

  return (
    <div>
      <PageHeader
        title="Project Analytics"
        action={
          <Link href="/projects" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to projects
          </Link>
        }
      />

      {a.total === 0 ? (
        <EmptyState icon={HardHat} title="No projects yet" description="Analytics populate as projects execute." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active" value={a.active} hint={`${a.completed} completed`} icon={HardHat} tone="primary" />
            <StatTile label="Value in execution" value={a.valueInExecution > 0 ? compactINR(a.valueInExecution) : "—"} icon={IndianRupee} tone="ok" />
            <StatTile label="Avg progress" value={a.avgProgressPct != null ? `${a.avgProgressPct}%` : "—"} icon={TrendingUp} tone="default" />
            <StatTile label="On-time stages" value={onTimePct != null ? `${onTimePct}%` : "—"} hint={`${a.delayedStages} delayed`} icon={AlarmClock} tone={onTimePct != null && onTimePct >= 80 ? "ok" : "warn"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.funnel.map((f) => (
                  <div key={f.status} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 text-muted">{f.status.replace(/_/g, " ")}</span>
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
                <CardTitle>Receivables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Outstanding</span>
                  <span className="font-semibold tabular-nums">{a.receivablesOutstanding > 0 ? compactINR(a.receivablesOutstanding) : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Overdue</span>
                  <span className={`font-semibold tabular-nums ${a.receivablesOverdue > 0 ? "text-danger" : ""}`}>
                    {a.receivablesOverdue > 0 ? compactINR(a.receivablesOverdue) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-muted">Overdue milestones</span>
                  <span className="font-medium tabular-nums">{a.overdueMilestones}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Stages completed</span>
                  <span className="font-medium tabular-nums">{a.doneStages}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
