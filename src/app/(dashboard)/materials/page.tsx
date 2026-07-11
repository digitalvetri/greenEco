import Link from "next/link";
import { Package, AlertTriangle, ShoppingCart, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  listItems,
  listVendors,
  listLocations,
  listPOs,
  listMaterialRequests,
  materialsStats,
  materialCategories,
  itemOptions,
} from "@/server/services/materials";
import { listOrders } from "@/server/services/order";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/ui/export-button";
import { MaterialsAdmin } from "./materials-admin";
import { MaterialsTools } from "./materials-tools";
import { StockList, type StockRow } from "./stock-list";
import { MaterialsSearch } from "./materials-search";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

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
        subtitle={`${items.length}${nextCursor ? "+" : ""} items shown`}
        action={
          <>
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Items" value={stats.totalItems} icon={Package} tone="primary" />
        <StatTile label="Low stock" value={stats.lowStockCount} icon={AlertTriangle} tone={stats.lowStockCount > 0 ? "danger" : "default"} />
        <StatTile label="Open POs" value={stats.openPOs} icon={ShoppingCart} tone={stats.openPOs > 0 ? "warn" : "default"} />
        {isAdmin && (
          <StatTile label="Stock value" value={stats.stockValue != null && stats.stockValue > 0 ? compactINR(stats.stockValue) : "—"} icon={IndianRupee} tone="ok" />
        )}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Item Master & Stock (all locations)</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Link
                href={tabHref("")}
                className={"rounded-full px-3 py-1 text-xs font-medium " + (!category ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={tabHref(c)}
                  className={"rounded-full px-3 py-1 text-xs font-medium " + (category === c ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")}
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

      {isAdmin && <AdminTools session={session} />}
    </div>
  );
}

async function AdminTools({ session }: { session: Awaited<ReturnType<typeof getSession>> }) {
  const [opts, vendors, locations, pos, orders, requests] = await Promise.all([
    itemOptions(session),
    listVendors(session),
    listLocations(session),
    listPOs(session),
    listOrders(session, { take: 100 }),
    listMaterialRequests(session),
  ]);

  const itemOpts = opts.map((i) => ({ id: i.id, name: i.name }));
  const locationOpts = locations.map((l) => ({ id: l.id, name: l.name, type: l.type as string }));

  return (
    <div className="space-y-4">
      <MaterialsAdmin
        items={itemOpts}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, categories: v.categories }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        pos={pos.map((p) => ({
          id: p.id,
          poNo: p.poNo,
          vendor: p.vendor.name,
          status: p.status,
          totalValue: p.totalValue.toString(),
          items: (p.items as { itemId: string; qty: number; rate: number }[]) ?? [],
          received: p.status === "RECEIVED" || p.status === "CLOSED",
        }))}
      />

      <MaterialsTools
        items={itemOpts}
        locations={locationOpts}
        siteLocations={locationOpts.filter((l) => l.type === "SITE").map((l) => ({ id: l.id, name: l.name }))}
        orders={orders.items.map((o) => ({ id: o.id, orderNo: o.orderNo, clientName: o.clientName }))}
        requests={requests.map((r) => ({
          id: r.id,
          orderNo: r.order.orderNo,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          items: (r.items as { itemId: string; qty: number }[]) ?? [],
        }))}
      />
    </div>
  );
}
