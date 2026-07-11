import Link from "next/link";
import { ArrowLeft, Package, AlertTriangle, IndianRupee, PackageMinus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { materialsAnalytics } from "@/server/services/materials";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function MaterialsAnalyticsPage() {
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const a = await materialsAnalytics(session);
  const maxCat = Math.max(1, ...a.categoryValue.map((c) => c.value));
  const maxVendor = Math.max(1, ...a.vendorSpend.map((v) => v.spent));
  const maxMove = Math.max(1, ...a.movementCounts.map((m) => m.count));

  return (
    <div>
      <PageHeader
        title="Materials Analytics"
        action={
          <Link href="/materials" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to materials
          </Link>
        }
      />

      {a.totalItems === 0 ? (
        <EmptyState icon={Package} title="No items yet" description="Analytics populate as stock moves." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Items" value={a.totalItems} icon={Package} tone="primary" />
            <StatTile label="Low stock" value={a.lowStockCount} icon={AlertTriangle} tone={a.lowStockCount > 0 ? "danger" : "default"} />
            <StatTile label="Stock value" value={a.stockValue != null && a.stockValue > 0 ? compactINR(a.stockValue) : "—"} hint={a.stockValue != null ? undefined : "admin only"} icon={IndianRupee} tone="ok" />
            <StatTile label="Issued to sites" value={a.consumptionValue != null && a.consumptionValue > 0 ? compactINR(a.consumptionValue) : "—"} hint={a.consumptionValue != null ? "consumption ₹" : "admin only"} icon={PackageMinus} tone="default" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Stock value by category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {a.categoryValue.length === 0 ? (
                    <p className="text-sm text-muted">No priced stock yet.</p>
                  ) : (
                    a.categoryValue.map((c) => (
                      <div key={c.category} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate text-muted">{c.category}</span>
                        <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                          <div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, (c.value / maxCat) * 100)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right font-medium tabular-nums">{compactINR(c.value)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Open PO aging</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {a.poAging.length === 0 ? (
                  <p className="text-muted">No open purchase orders.</p>
                ) : (
                  a.poAging.map((p) => (
                    <div key={p.bucket} className="flex items-center justify-between">
                      <span className="text-muted">{p.bucket}</span>
                      <span className={`font-medium tabular-nums ${p.bucket === ">30d" && p.count > 0 ? "text-danger" : ""}`}>{p.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {isAdmin && a.vendorSpend.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top vendor spend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {a.vendorSpend.map((v) => (
                    <div key={v.vendor} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 truncate text-muted">{v.vendor}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                        <div className="h-full rounded bg-primary/70" style={{ width: `${Math.max(4, (v.spent / maxVendor) * 100)}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right font-medium tabular-nums">{compactINR(v.spent)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Ledger activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.movementCounts.length === 0 ? (
                  <p className="text-sm text-muted">No movements yet.</p>
                ) : (
                  a.movementCounts.map((m) => (
                    <div key={m.type} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 text-muted">{m.type.replace(/_/g, " ")}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-border">
                        <div className="h-full rounded bg-primary/50" style={{ width: `${Math.max(4, (m.count / maxMove) * 100)}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right font-medium tabular-nums">{m.count}</span>
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
