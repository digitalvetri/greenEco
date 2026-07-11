import Link from "next/link";
import { HardHat, PauseCircle, AlarmClock, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listOrders, orderStats } from "@/server/services/order";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { ProjectsList, type ProjectRow } from "./projects-list";
import { ProjectsSearch } from "./projects-search";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ON_HOLD", label: "On hold" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const session = await getSession();

  const [{ items, nextCursor }, stats] = await Promise.all([
    listOrders(session, { status: status || undefined, search: search || undefined, take: 50 }),
    orderStats(session),
  ]);

  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  const query = new URLSearchParams({ ...persist, ...(status ? { status } : {}) }).toString();
  const tabHref = (key: string) => {
    const p = new URLSearchParams(persist);
    if (key) p.set("status", key);
    const s = p.toString();
    return s ? `/projects?${s}` : "/projects";
  };

  const rows: ProjectRow[] = items.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    clientName: o.clientName,
    siteAddress: o.siteAddress,
    status: o.status,
    projectValue: "projectValue" in o ? (o as { projectValue: string }).projectValue : undefined,
    progress: o.progress,
    nextDue: o.nextDue,
    overdue: o.overdue,
  }));

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${items.length}${nextCursor ? "+" : ""} shown`}
        action={
          <Link
            href="/projects/analytics"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
          >
            <BarChart3 className="size-4" /> Analytics
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active" value={stats.active} icon={HardHat} tone="primary" href={tabHref("ACTIVE")} />
        <StatTile label="On hold" value={stats.onHold} icon={PauseCircle} tone={stats.onHold > 0 ? "warn" : "default"} href={tabHref("ON_HOLD")} />
        <StatTile label="Payments overdue" value={stats.overduePayments} icon={AlarmClock} tone={stats.overduePayments > 0 ? "danger" : "default"} />
        <StatTile label="Receivables" value={stats.receivables > 0 ? compactINR(stats.receivables) : "—"} hint={`${stats.completed} completed`} icon={IndianRupee} tone="ok" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = (t.key === "" && !status) || status === t.key;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <ProjectsSearch />

      <ProjectsList key={query} initialItems={rows} initialCursor={nextCursor} query={query} />
    </div>
  );
}
