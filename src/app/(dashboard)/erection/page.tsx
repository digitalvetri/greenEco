import Link from "next/link";
import { ClipboardCheck, AlertOctagon, IndianRupee, HelpCircle, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listEntries, budgetVsActual, erectionStats } from "@/server/services/erection";
import { listOrders } from "@/server/services/order";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";
import { ExportButton } from "@/components/ui/export-button";
import { EntryForm, VerificationCard } from "./erection-widgets";
import { EntryList, type EntryRow } from "./entry-list";
import { ErectionSearch } from "./erection-search";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "QUERIED", label: "Queried" },
  { key: "REJECTED", label: "Rejected" },
];
const TYPE_TABS = [
  { key: "", label: "All types" },
  { key: "LABOUR", label: "Labour" },
  { key: "SITE_PURCHASE", label: "Site purchase" },
  { key: "OTHER", label: "Other" },
];
const BVA_LIMIT = 10;

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ErectionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; search?: string }>;
}) {
  const { status, type, search } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const orders = (await listOrders(session, { take: 100 })).items;
  const projects = orders.map((o) => ({ id: o.id, label: `${o.orderNo} · ${o.clientName}` }));

  const [stats, entryPage, pendingPage] = await Promise.all([
    erectionStats(session),
    listEntries(session, { status: status || undefined, type: type || undefined, search: search || undefined, take: 50 }),
    isAdmin ? listEntries(session, { needsReview: true, take: 50 }) : Promise.resolve({ items: [], nextCursor: null }),
  ]);

  // Budget vs Actual — capped fan-out (full budget-burn moves to /erection/analytics).
  const activeOrders = orders.filter((o) => o.status === "ACTIVE");
  const bvas = isAdmin
    ? await Promise.all(
        activeOrders.slice(0, BVA_LIMIT).map(async (o) => ({ order: o, bva: await budgetVsActual(session, o.id) })),
      )
    : [];

  const rows: EntryRow[] = entryPage.items.map((e) => ({
    id: e.id,
    type: e.type,
    description: e.description,
    amount: e.amount.toString(),
    status: e.status,
    orderNo: e.order.orderNo,
    clientName: e.order.clientName,
  }));

  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  if (type) persist.type = type;
  if (status) persist.status = status;
  const query = new URLSearchParams(persist).toString();
  const tabHref = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(persist);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/erection?${s}` : "/erection";
  };

  return (
    <div>
      <PageHeader
        title="Erection & Site Cost"
        subtitle={isAdmin ? "Verification, actuals & budget" : "Log site labour & purchases"}
        action={
          isAdmin ? (
            <Link href="/erection/analytics" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
              <BarChart3 className="size-4" /> Analytics
            </Link>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pending review" value={stats.pendingReview} icon={ClipboardCheck} tone={stats.pendingReview > 0 ? "warn" : "default"} href={tabHref({ status: "PENDING", type: undefined })} />
        <StatTile label="Queried / rejected" value={stats.queriedRejected} icon={HelpCircle} tone={stats.queriedRejected > 0 ? "danger" : "default"} />
        {isAdmin ? (
          <>
            <StatTile label="Approved spend" value={stats.approvedSpend != null && stats.approvedSpend > 0 ? compactINR(stats.approvedSpend) : "—"} icon={IndianRupee} tone="ok" />
            <StatTile label="Overrun projects" value={stats.overrunProjects ?? 0} icon={AlertOctagon} tone={(stats.overrunProjects ?? 0) > 0 ? "danger" : "default"} />
          </>
        ) : null}
      </div>

      <EntryForm projects={projects} />

      {isAdmin && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Needs review ({pendingPage.items.length})</h2>
          <div className="mb-6 space-y-2">
            {pendingPage.items.length === 0 && <Card className="p-4 text-sm text-muted">Nothing awaiting review.</Card>}
            {pendingPage.items.map((e) => (
              <VerificationCard
                key={e.id}
                entry={{
                  id: e.id,
                  type: e.type,
                  description: e.description,
                  amount: e.amount.toString(),
                  status: e.status,
                  gangOrShop: e.gangOrShop,
                  billImages: (e.billImages as { url: string }[]) ?? [],
                  orderNo: e.order.orderNo,
                  createdById: e.createdById,
                }}
              />
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted">Budget vs Actual</h2>
            <div className="flex flex-wrap items-center gap-2">
              {activeOrders.length > BVA_LIMIT && <span className="text-xs text-muted">showing {BVA_LIMIT} of {activeOrders.length}</span>}
              <ExportButton
                rows={bvas.map(({ order, bva }) => ({
                  Project: `${order.orderNo} · ${order.clientName}`,
                  Budget: bva.budget,
                  Spent: bva.spent,
                  Committed: bva.committed,
                  Remaining: bva.remaining,
                  "% consumed": bva.pctConsumed,
                }))}
                filename="budget-vs-actual"
                label="Export BvA"
              />
            </div>
          </div>
          <div className="mb-6 space-y-3">
            {bvas.length === 0 && <Card className="p-4 text-sm text-muted">No active projects with budgets.</Card>}
            {bvas.map(({ order, bva }) => (
              <Card key={order.id}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/erection/${order.id}`} className="hover:text-primary hover:underline">
                      {order.orderNo} · {order.clientName}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <Stat label="Budget" value={formatINR(bva.budget)} />
                    <Stat label="Spent" value={formatINR(bva.spent)} />
                    <Stat label="Committed" value={formatINR(bva.committed)} tone="warn" />
                    <Stat label="Remaining" value={formatINR(bva.remaining)} tone={Number(bva.remaining) < 0 ? "danger" : "ok"} />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className={"h-full " + (bva.pctConsumed >= 100 ? "bg-danger" : bva.pctConsumed >= 90 ? "bg-warn" : "bg-primary")}
                      style={{ width: `${Math.min(bva.pctConsumed, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted">{bva.pctConsumed}% consumed</span>
                    <a href={`/print/closeout/${order.id}`} target="_blank" rel="noreferrer" className="text-primary">
                      Close-out PDF →
                    </a>
                  </div>
                  {bva.alert && <div className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs text-danger">⚠ {bva.alert}</div>}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="default">Labour {formatINR(bva.categories.labour)}</Badge>
                    <Badge variant="default">Purchases {formatINR(bva.categories.sitePurchase)}</Badge>
                    <Badge variant="default">Consumption {formatINR(bva.categories.consumption)}</Badge>
                    <Badge variant="default">Other {formatINR(bva.categories.other)}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{isAdmin ? "All Entries" : "My Entries"}</h2>
        <ExportButton
          rows={rows.map((e) => ({ Project: e.orderNo, Type: e.type, Description: e.description, "Amount ₹": e.amount, Status: e.status }))}
          filename="erection-entries"
          label="Export"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => {
          const active = (t.key === "" && !status) || status === t.key;
          return (
            <Link key={t.key} href={tabHref({ status: t.key || undefined })} className={"rounded-full px-3 py-1 text-xs font-medium " + (active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TYPE_TABS.map((t) => {
          const active = (t.key === "" && !type) || type === t.key;
          return (
            <Link key={t.key} href={tabHref({ type: t.key || undefined })} className={"rounded-full px-2.5 py-0.5 text-[11px] font-medium " + (active ? "bg-foreground text-background" : "border border-border bg-card text-muted")}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <ErectionSearch />
      {rows.length === 0 && !search && !status && !type ? (
        <EmptyState icon={ClipboardCheck} title="No entries yet" description="Log site labour or a purchase to get started." />
      ) : (
        <EntryList key={query} initialItems={rows} initialCursor={entryPage.nextCursor} query={query} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" | "ok" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "";
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={"font-bold tabular-nums " + c}>{value}</div>
    </div>
  );
}
