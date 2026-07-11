import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, IndianRupee, PercentCircle, AlertOctagon } from "lucide-react";
import { getSession } from "@/lib/auth";
import { erectionAnalytics } from "@/server/services/erection";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ErectionAnalyticsPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") notFound(); // all cost aggregates → admin-only
  const a = await erectionAnalytics(session);
  const maxType = Math.max(1, ...a.spendByType.map((t) => t.value));
  const maxStatus = Math.max(1, ...a.byStatus.map((s) => s.count));

  return (
    <div>
      <PageHeader
        title="Erection Analytics"
        action={
          <Link href="/erection" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to erection
          </Link>
        }
      />

      {a.totalEntries === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No entries yet" description="Analytics populate as site cost is logged." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Entries" value={a.totalEntries} icon={ClipboardCheck} tone="primary" />
            <StatTile label="Total spend" value={a.totalSpend > 0 ? compactINR(a.totalSpend) : "—"} icon={IndianRupee} tone="ok" />
            <StatTile label="Approval rate" value={a.approvalRatePct != null ? `${a.approvalRatePct}%` : "—"} icon={PercentCircle} tone={a.approvalRatePct != null && a.approvalRatePct >= 80 ? "ok" : "warn"} />
            <StatTile label="Overrun projects" value={a.overrunCount} icon={AlertOctagon} tone={a.overrunCount > 0 ? "danger" : "default"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spend by type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.spendByType.map((t) => (
                  <div key={t.type} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 text-muted">{t.type}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                      <div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, (t.value / maxType) * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right font-medium tabular-nums">{compactINR(t.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Entries by status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted">{s.status}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                      <div className="h-full rounded bg-primary/60" style={{ width: `${Math.max(4, (s.count / maxStatus) * 100)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Budget burn (active projects)</CardTitle>
            </CardHeader>
            <CardContent>
              {a.budgetBurn.length === 0 ? (
                <p className="text-sm text-muted">No active projects with budgets.</p>
              ) : (
                <div className="space-y-3">
                  {a.budgetBurn.map((b) => (
                    <div key={b.orderNo}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">
                          <span className="font-mono text-xs text-muted">{b.orderNo}</span> · {b.clientName}
                        </span>
                        <span className={"font-medium tabular-nums " + (b.overrun ? "text-danger" : "")}>
                          {compactINR(b.spent)} / {compactINR(b.budget)} · {b.pctConsumed}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                        <div className={"h-full " + (b.pctConsumed >= 100 ? "bg-danger" : b.pctConsumed >= 90 ? "bg-warn" : "bg-primary")} style={{ width: `${Math.min(b.pctConsumed, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
