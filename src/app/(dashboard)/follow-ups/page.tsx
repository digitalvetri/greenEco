import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  listFollowUpWorklist,
  listCalendarEvents,
  type CalendarStatusFilter,
} from "@/server/services/calendar";
import { listCompanyUsers } from "@/server/services/lead";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { CalendarView } from "@/components/calendar/calendar-view";
import { ViewTabs } from "./view-tabs";
import { FollowUpsFilters } from "./followups-filters";
import { Worklist } from "./worklist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Follow-ups — Green Ecocare CRM" };

/**
 * Follow-ups — the daily worklist.
 *
 * Two views over ONE service (`services/calendar.ts`): a bucketed list and the
 * month/week/day calendar. Both cover manual follow-ups (on a lead OR a proposal)
 * and the automation engine's auto-tasks, so "what do I owe today" has a single
 * answer rather than one per page.
 *
 * Mounted in the sidebar — both this page and the calendar existed for a while
 * with no link anywhere in the app pointing at them, the same way the material
 * request flow was unreachable in v27.
 */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const view = params.view === "calendar" ? "calendar" : "list";

  const type = params.type || undefined;
  const ownerId = isAdmin ? params.owner || undefined : undefined;
  const status = (params.status as CalendarStatusFilter) || undefined;

  const owners = isAdmin ? await listCompanyUsers(session) : [];

  if (view === "calendar") {
    // Seed year/month from the URL; the server's own date is the default (no
    // Date.now() inside render — the repo's react-hooks/purity rule).
    const serverNow = new Date();
    const year = Math.max(2020, Math.min(2030, parseInt(params.year ?? "", 10) || serverNow.getFullYear()));
    const month = Math.max(1, Math.min(12, parseInt(params.month ?? "", 10) || serverNow.getMonth() + 1));
    const calView = (["month", "week", "day"].includes(params.calView ?? "") ? params.calView : "month") as
      | "month"
      | "week"
      | "day";

    // One month, plus a week either side for the grid's overflow cells.
    const from = new Date(year, month - 2, 25);
    const to = new Date(year, month, 7);
    const events = await listCalendarEvents(session, { from, to, type, ownerId, status });

    return (
      <div>
        <PageHeader title="Follow-ups" subtitle="Everything you owe, on a calendar" />
        <ViewTabs view="calendar" />
        <CalendarView
          initialEvents={events}
          year={year}
          month={month}
          view={calView}
          todayISO={serverNow.toISOString()}
          filters={{
            type: params.type ?? "",
            owner: params.owner ?? "",
            status: params.status ?? "",
          }}
        />
      </div>
    );
  }

  const horizonDays = Math.max(1, Math.min(365, parseInt(params.days ?? "", 10) || 30));
  const data = await listFollowUpWorklist(session, { horizonDays, type, ownerId, status });
  const total = data.counts.overdue + data.counts.today + data.counts.upcoming;

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${total} item${total === 1 ? "" : "s"} across your leads, quotes and reminders`}
      />
      <ViewTabs view="list" />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile
          label="Overdue"
          value={data.counts.overdue}
          icon={AlertTriangle}
          tone={data.counts.overdue > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Due today"
          value={data.counts.today}
          icon={CalendarClock}
          tone={data.counts.today > 0 ? "warn" : "default"}
        />
        <StatTile label="Upcoming" value={data.counts.upcoming} icon={CalendarDays} tone="primary" />
      </div>

      <FollowUpsFilters owners={owners} showOwner={isAdmin} showHorizon />

      <Worklist data={data} />
    </div>
  );
}
