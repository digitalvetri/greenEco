import Link from "next/link";
import { Package, AlertTriangle, ShoppingCart, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listItems, materialsStats, materialCategories } from "@/server/services/materials";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent } from "@/components/ui/card";
import { ExportButton } from "@/components/ui/export-button";
import { StockList, type StockRow } from "./stock-list";
import { MaterialsSearch } from "./materials-search";
import { MaterialsNav } from "./materials-nav";
import { AddItemCard } from "./add-item-card";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

/**
 * Materials → Stock. The landing section: what do we have, and where.
 *
 * Only fetches what this section renders — the old page fetched vendors/POs/orders/
 * requests too, on every visit, for forms that lived far below the fold.
 */
export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>;
}) {
  const { category, search } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const [{ items, nextCursor }, stats, categories] = await Promise.all([
    listItems(session, { category: category || undefined, search: search || undefined, take: 50 }),
    materialsStats(session),
    materialCategories(session),
  ]);

  const rows: StockRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    total: i.total,
    byLocation: i.byLocation,
    lowStock: i.lowStock,
    purchasePrice: "purchasePrice" in i ? String((i as { purchasePrice: unknown }).purchasePrice ?? "") : undefined,
  }));

  const exportRows = rows.map((i) => ({
    Item: i.name,
    Category: i.category,
    Unit: i.unit,
    Total: i.total,
    ...(isAdmin && i.purchasePrice ? { "Purchase ₹": i.purchasePrice } : {}),
  }));

  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  const query = new URLSearchParams({ ...persist, ...(category ? { category } : {}) }).toString();
  const tabHref = (key: string) => {
    const p = new URLSearchParams(persist);
    if (key) p.set("category", key);
    const s = p.toString();
    return s ? `/materials?${s}` : "/materials";
  };

  return (
    <div>
      <PageHeader
        title="Materials"
        subtitle="Stock on hand across every location"
        action={
          <>
            {/* Analytics is open to EMPLOYEE too — every ₹ surface is stripped there, not gated (v19 P1-4). */}
            <Link
              href="/materials/analytics"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
            >
              <BarChart3 className="size-4" /> Analytics
            </Link>
            <ExportButton rows={exportRows} filename="stock" label="Export" />
          </>
        }
      />

      <MaterialsNav isAdmin={isAdmin} requestCount={stats.pendingRequests} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Items" value={stats.totalItems} icon={Package} tone="primary" />
        <StatTile
          label="Low stock"
          value={stats.lowStockCount}
          icon={AlertTriangle}
          tone={stats.lowStockCount > 0 ? "danger" : "default"}
        />
        <StatTile label="Open POs" value={stats.openPOs} icon={ShoppingCart} tone={stats.openPOs > 0 ? "warn" : "default"} />
        {isAdmin && (
          <StatTile
            label="Stock value"
            value={stats.stockValue != null && stats.stockValue > 0 ? compactINR(stats.stockValue) : "—"}
            icon={IndianRupee}
            tone="ok"
          />
        )}
      </div>

      {isAdmin && (
        <div className="mb-4">
          <AddItemCard />
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          {categories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Link
                href={tabHref("")}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (!category ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
                }
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={tabHref(c)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium " +
                    (category === c ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
                  }
                >
                  {c}
                </Link>
              ))}
            </div>
          )}
          <MaterialsSearch />
          <StockList key={query} initialItems={rows} initialCursor={nextCursor} query={query} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}
