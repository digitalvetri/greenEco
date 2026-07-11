import Link from "next/link";
import { Users, HardHat, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listClients, clientStats } from "@/server/services/client";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { ClientsList, type ClientRow } from "./clients-list";
import { ClientsSearch } from "./clients-search";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const session = await getSession();

  const [{ items, nextCursor }, stats] = await Promise.all([
    listClients(session, { search: search || undefined, take: 50 }),
    clientStats(session),
  ]);

  const query = new URLSearchParams(search ? { search } : {}).toString();

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${items.length}${nextCursor ? "+" : ""} shown`}
        action={
          <Link href="/clients/analytics" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <BarChart3 className="size-4" /> Analytics
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile label="Clients" value={stats.totalClients} icon={Users} tone="primary" />
        <StatTile label="Active projects" value={stats.activeProjects} icon={HardHat} tone={stats.activeProjects > 0 ? "ok" : "default"} />
        <StatTile label="Lifetime value" value={stats.lifetimeValue > 0 ? compactINR(stats.lifetimeValue) : "—"} icon={IndianRupee} tone="ok" />
      </div>

      <ClientsSearch />
      <ClientsList key={query} initialItems={items as ClientRow[]} initialCursor={nextCursor} query={query} />
    </div>
  );
}
