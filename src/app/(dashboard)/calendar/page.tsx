import { getSession } from "@/lib/auth";
import { listCalendarEvents } from "@/server/services/calendar";
import type { CalendarStatusFilter } from "@/server/services/calendar";
import { CalendarView } from "@/components/calendar/calendar-view";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const session = await getSession();

  // Seed year/month from URL; default to server's current date (no Date.now() in render)
  const serverNow = new Date();
  const year = Math.max(2020, Math.min(2030, parseInt(params.year ?? "", 10) || serverNow.getFullYear()));
  const month = Math.max(1, Math.min(12, parseInt(params.month ?? "", 10) || serverNow.getMonth() + 1));
  const view = (["month", "week", "day"].includes(params.view ?? "") ? params.view : "month") as
    | "month"
    | "week"
    | "day";

  // Fetch one full month (with a 7-day buffer on each side for calendar grid overflow cells)
  const from = new Date(year, month - 2, 25); // ~last week of previous month
  const to = new Date(year, month, 7); // ~first week of next month

  const events = await listCalendarEvents(session, {
    from,
    to,
    type: params.type || undefined,
    ownerId: params.owner || undefined,
    status: (params.status as CalendarStatusFilter) || undefined,
  });

  return (
    <CalendarView
      initialEvents={events}
      year={year}
      month={month}
      view={view}
      todayISO={serverNow.toISOString()}
      filters={{
        type: params.type ?? "",
        owner: params.owner ?? "",
        status: params.status ?? "",
      }}
    />
  );
}
