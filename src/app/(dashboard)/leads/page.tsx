import Link from "next/link";
import { Plus, Sparkles, CalendarClock, Snowflake, CheckCircle2, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listLeadCustomers, leadStats, listCompanyUsers } from "@/server/services/lead";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { LeadImportExport } from "./lead-import";
import { LeadsList } from "./leads-list";
import { LeadsFilters } from "./leads-filters";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "IN_FOLLOWUP", label: "In Follow-up" },
  { key: "QUOTE_REQUESTED", label: "Quote Req." },
  { key: "cold", label: "Going Cold" },
  { key: "CONVERTED", label: "Converted" },
  { key: "LOST", label: "Lost" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; source?: string; assignee?: string; dueToday?: string }>;
}) {
  const { status, search, source, assignee, dueToday } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const cold = status === "cold";
  const due = dueToday === "1";

  const [{ items, nextOffset }, stats, members] = await Promise.all([
    listLeadCustomers(session, {
      status: cold || due ? undefined : status || undefined,
      cold,
      dueToday: due,
      search: search || undefined,
      source: source || undefined,
      assignedToId: assignee || undefined,
      take: 25,
    }),
    leadStats(session),
    isAdmin ? listCompanyUsers(session) : Promise.resolve([]),
  ]);

  // Non-status filters persist across tab switches and drive "Load more".
  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  if (source) persist.source = source;
  if (assignee) persist.assignee = assignee;

  const query = new URLSearchParams({
    ...persist,
    ...(due ? { dueToday: "1" } : cold ? { cold: "1" } : status ? { status } : {}),
  }).toString();

  const tabHref = (key: string) => {
    const p = new URLSearchParams(persist);
    if (key) p.set("status", key);
    const s = p.toString();
    return s ? `/leads?${s}` : "/leads";
  };

  const dueHref = () => {
    if (due) return tabHref(""); // toggle off
    const p = new URLSearchParams(persist);
    p.set("dueToday", "1");
    return `/leads?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${items.length}${nextOffset !== null ? "+" : ""} customers shown`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/leads/analytics"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
            >
              <BarChart3 className="size-4" /> Analytics
            </Link>
            <LeadImportExport filters={{ status, source, assignee, cold, search }} />
            <Link href="/leads/new">
              <Button>
                <Plus className="size-4" /> New Lead
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New leads" value={stats.newCount} icon={Sparkles} tone="primary" href={tabHref("NEW")} />
        <StatTile
          label="Follow-ups due today"
          value={stats.dueToday}
          icon={CalendarClock}
          tone={stats.dueToday > 0 ? "warn" : "default"}
          href={dueHref()}
        />
        <StatTile
          label="Going cold"
          value={stats.cold}
          icon={Snowflake}
          tone={stats.cold > 0 ? "danger" : "default"}
          href={tabHref("cold")}
        />
        <StatTile
          label="Converted this month"
          value={stats.convertedThisMonth}
          icon={CheckCircle2}
          tone="ok"
          href={tabHref("CONVERTED")}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => {
          const active = (t.key === "" && !status) || status === t.key;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <LeadsFilters members={members} isAdmin={isAdmin} currentUserId={session.userId} />

      {/* key on the filter query so a soft navigation (filter change) remounts the
          list with fresh state instead of keeping the previous view's rows. */}
      <LeadsList
        key={query}
        initialCustomerItems={items}
        initialCustomerOffset={nextOffset}
        query={query}
        members={members}
        isAdmin={isAdmin}
      />
    </div>
  );
}
