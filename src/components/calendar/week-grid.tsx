"use client";

import type { CalendarEvent } from "@/server/services/calendar";
import { eventColor } from "./event-colors";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function toISTKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Get the 7 dates of the week containing a given year/month/day */
function getWeekDates(year: number, month: number, day: number): Date[] {
  const anchor = new Date(year, month - 1, day);
  const dow = anchor.getDay();
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

export function WeekGrid({
  year,
  month,
  selectedDay,
  events,
  todayKey,
  onEventClick,
}: {
  year: number;
  month: number;
  selectedDay: number;
  events: CalendarEvent[];
  todayKey: string;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weekDates = getWeekDates(year, month, selectedDay);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = toISTKey(ev.date);
    const arr = byDate.get(key) ?? [];
    arr.push(ev);
    byDate.set(key, arr);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDates.map((d, i) => {
          const key = d.toLocaleDateString("en-CA");
          const isToday = key === todayKey;
          return (
            <div key={i} className="py-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {DAY_NAMES[d.getDay()]}
              </div>
              <div
                className={`mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-bold ${
                  isToday ? "bg-primary text-white" : "text-foreground"
                }`}
              >
                {d.getDate()}
              </div>
              <div className="text-[10px] text-muted">
                {MONTH_NAMES[d.getMonth()]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event columns */}
      <div className="grid grid-cols-7 min-h-[300px]">
        {weekDates.map((d, i) => {
          const key = d.toLocaleDateString("en-CA");
          const dayEvents = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`border-r border-border p-1.5 space-y-1 last:border-r-0 ${
                isToday ? "bg-primary/5" : ""
              }`}
            >
              {dayEvents.length === 0 && (
                <div className="text-[10px] text-muted/40 text-center pt-2">—</div>
              )}
              {dayEvents.map((ev) => {
                const color = eventColor(ev.type, ev.isOverdue);
                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className="w-full rounded-md px-1.5 py-1 text-left text-[10px] leading-tight hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: color.bg, color: color.text }}
                    title={ev.title}
                  >
                    <div className="font-semibold truncate">{ev.title}</div>
                    <div className="opacity-80">{fmtTime(ev.date)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
