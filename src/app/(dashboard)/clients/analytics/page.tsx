import Link from "next/link";
import { ArrowLeft, Users, Repeat, IndianRupee } from "lucide-react";
import { getSession } from "@/lib/auth";
import { clientAnalytics } from "@/server/services/client";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ClientAnalyticsPage() {
  const session = await getSession();
  const a = await clientAnalytics(session);
  const maxVal = Math.max(1, ...a.topClients.map((c) => c.value));

  return (
    <div>
      <PageHeader
        title="Client Analytics"
        action={
          <Link href="/clients" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to clients
          </Link>
        }
      />

      {a.uniqueCustomers === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Analytics populate once leads convert." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Unique customers" value={a.uniqueCustomers} hint="deduped by phone" icon={Users} tone="primary" />
            <StatTile label="Repeat customers" value={a.repeatCustomers} hint="> 1 project" icon={Repeat} tone={a.repeatCustomers > 0 ? "ok" : "default"} />
            <StatTile label="Lifetime value" value={a.totalLifetimeValue > 0 ? compactINR(a.totalLifetimeValue) : "—"} icon={IndianRupee} tone="ok" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top clients by revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.topClients.map((c) => (
                <div key={c.phone} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate">
                    {c.name}
                    {c.projects > 1 && <span className="ml-1 text-xs text-muted">×{c.projects}</span>}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                    <div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, (c.value / maxVal) * 100)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">{compactINR(c.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
