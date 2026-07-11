import Link from "next/link";
import { ArrowLeft, Trophy, IndianRupee, Target, Clock, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { proposalAnalytics } from "@/server/services/proposal";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ProposalAnalyticsPage() {
  const session = await getSession();
  const a = await proposalAnalytics(session);
  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));
  const aiRate = a.aiVsManual.ai.closed > 0 ? Math.round((a.aiVsManual.ai.won / a.aiVsManual.ai.closed) * 100) : null;
  const manualRate = a.aiVsManual.manual.closed > 0 ? Math.round((a.aiVsManual.manual.won / a.aiVsManual.manual.closed) * 100) : null;

  return (
    <div>
      <PageHeader
        title="Proposal Analytics"
        action={
          <Link href="/proposals" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to proposals
          </Link>
        }
      />

      {a.total === 0 ? (
        <EmptyState icon={Trophy} title="No proposals yet" description="Analytics populate as you quote and close deals." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Win rate"
              value={a.winRatePct != null ? `${a.winRatePct}%` : "—"}
              hint={`${a.won} won · ${a.lost} lost`}
              icon={Target}
              tone={a.winRatePct != null && a.winRatePct >= 50 ? "ok" : "warn"}
            />
            <StatTile
              label="Win rate by value"
              value={a.winRateByValuePct != null ? `${a.winRateByValuePct}%` : "—"}
              hint="won ₹ / closed ₹"
              icon={Trophy}
              tone="primary"
            />
            <StatTile label="Avg deal size" value={a.avgDealSize > 0 ? compactINR(a.avgDealSize) : "—"} icon={IndianRupee} tone="default" />
            <StatTile
              label="Open pipeline"
              value={a.openPipelineValue > 0 ? compactINR(a.openPipelineValue) : "—"}
              hint={`${a.open} in play`}
              icon={IndianRupee}
              tone="ok"
            />
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
                      <div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, (f.count / maxFunnel) * 100)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium tabular-nums">{f.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" /> AI vs manual win rate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">AI-generated</span>
                  <span className="font-medium tabular-nums">
                    {aiRate != null ? `${aiRate}%` : "—"}{" "}
                    <span className="text-muted">({a.aiVsManual.ai.won}/{a.aiVsManual.ai.closed})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Manual</span>
                  <span className="font-medium tabular-nums">
                    {manualRate != null ? `${manualRate}%` : "—"}{" "}
                    <span className="text-muted">({a.aiVsManual.manual.won}/{a.aiVsManual.manual.closed})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Clock className="size-3.5" /> Avg quote→order
                  </span>
                  <span className="font-medium">{a.avgCycleDays != null ? `${a.avgCycleDays} days` : "—"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Why we lose</CardTitle>
              </CardHeader>
              <CardContent>
                {a.lostByReason.length === 0 ? (
                  <p className="text-sm text-muted">No lost proposals yet.</p>
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
                <CardTitle>By plant type</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {a.byPlantType.map((p) => (
                    <li key={p.plantType} className="flex justify-between gap-3">
                      <span>{p.plantType}</span>
                      <span className="text-muted tabular-nums">
                        {p.count} · <span className="text-ok">{p.won} won</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
