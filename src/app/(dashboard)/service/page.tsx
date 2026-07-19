import Link from "next/link";
import { FileCheck2, CalendarClock, Ticket, TimerReset, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { amcDashboard, listContracts, listTickets } from "@/server/services/amc";
import { listOrders } from "@/server/services/order";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { ExportButton } from "@/components/ui/export-button";
import { NewContractButton, NewTicketButton } from "./service-widgets";
import { ContractsList, type ContractRow } from "./contracts-list";
import { TicketsList, type TicketListRow } from "./tickets-list";
import { ServiceSearch } from "./service-search";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "EXPIRING", label: "Expiring" },
  { key: "EXPIRED", label: "Expired" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const [dash, contracts, tickets, orders] = await Promise.all([
    amcDashboard(session),
    listContracts(session, { status: status || undefined, search: search || undefined, take: 50 }),
    listTickets(session, { take: 50 }),
    listOrders(session, { take: 100 }),
  ]);

  const orderOpts = orders.items.map((o) => ({ id: o.id, label: `${o.orderNo} · ${o.clientName}` }));
  const contractOpts = contracts.items.map((c) => ({ id: c.id, label: `${c.contractNo} · ${c.clientName}` }));

  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  const query = new URLSearchParams({ ...persist, ...(status ? { status } : {}) }).toString();
  const tabHref = (key: string) => {
    const p = new URLSearchParams(persist);
    if (key) p.set("status", key);
    const s = p.toString();
    return s ? `/service?${s}` : "/service";
  };

  const contractRows: ContractRow[] = contracts.items.map((c) => ({
    id: c.id,
    contractNo: c.contractNo,
    clientName: c.clientName,
    frequency: c.frequency,
    liveStatus: c.liveStatus,
    daysToExpiry: c.daysToExpiry,
    visitCount: c._count.visits,
    annualValue: "annualValue" in c ? (c as { annualValue: string }).annualValue : undefined,
  }));

  // Excel export of the current contract view (RBAC-safe: annualValue only present for admin).
  const exportRows = contractRows.map((c) => ({
    "Contract No": c.contractNo,
    Client: c.clientName,
    Frequency: c.frequency,
    Status: c.liveStatus,
    "Days to expiry": c.daysToExpiry,
    Visits: c.visitCount,
    ...(c.annualValue ? { "Annual Value": c.annualValue } : {}),
  }));

  const ticketRows: TicketListRow[] = tickets.items.map((t) => ({
    id: t.id,
    ticketNo: t.ticketNo,
    title: t.title,
    priority: t.priority,
    status: t.status,
    raisedBy: t.raisedBy,
    slaDueDate: t.slaDueDate ? t.slaDueDate.toISOString() : null,
  }));

  return (
    <div className="gc-animate-in">
      <PageHeader
        title="Service / AMC"
        subtitle="Annual maintenance contracts, preventive-maintenance schedule & service tickets"
        action={
          <>
            <Link
              href="/service/analytics"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
            >
              <BarChart3 className="size-4" /> Analytics
            </Link>
            <ExportButton rows={exportRows} filename="amc-contracts" label="Export" />
            <NewTicketButton contracts={contractOpts} />
            <NewContractButton orders={orderOpts} isAdmin={isAdmin} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        <StatTile label="Active Contracts" value={dash.activeContracts} icon={FileCheck2} tone="primary" href={tabHref("ACTIVE")} />
        <StatTile label="Visits Due (month)" value={dash.visitsDueThisMonth} icon={CalendarClock} tone={dash.visitsDueThisMonth > 0 ? "warn" : "default"} />
        <StatTile label="Open Tickets" value={dash.openTickets} icon={Ticket} tone={dash.openTickets > 0 ? "warn" : "default"} />
        <StatTile label="Expiring ≤60d" value={dash.expiringSoon} icon={TimerReset} tone={dash.expiringSoon > 0 ? "danger" : "default"} href={tabHref("EXPIRING")} />
        {isAdmin && "amcAnnualRevenue" in dash && (
          <StatTile label="AMC Annual Revenue" value={formatINR((dash as { amcAnnualRevenue: string }).amcAnnualRevenue)} icon={IndianRupee} tone="ok" />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5">
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
            <ServiceSearch />
            <ContractsList key={query} initialItems={contractRows} initialCursor={contracts.nextCursor} query={query} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketsList initialItems={ticketRows} initialCursor={tickets.nextCursor} query="" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
