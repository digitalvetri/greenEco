"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/server/services/calendar";
import { eventColor } from "./event-colors";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

/** Convert an ISO UTC string to an IST date key "YYYY-MM-DD" */
function toISTKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Build the 6×7 calendar grid cells for a given year/month */
function buildCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev = new Date(year, month - 1, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  // Trailing days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ date: new Date(year, month - 2, d), isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), isCurrentMonth: true });
  }

  // Fill remaining to complete 6 rows (42 cells)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: false });
  }

  return cells;
}

function cellKey(d: Date) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD local (server renders in user's locale)
}

export function MonthGrid({
  year,
  month,
  events,
  todayKey,
  onEventClick,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  todayKey: string;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const cells = buildCells(year, month);

  // Group events by IST date key
  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = toISTKey(ev.date);
    const arr = byDate.get(key) ?? [];
    arr.push(ev);
    byDate.set(key, arr);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const key = cellKey(cell.date);
          const dayEvents = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;

          return (
            <DateCell
              key={idx}
              cell={cell}
              isToday={isToday}
              events={visible}
              overflow={overflow}
              allEvents={dayEvents}
              onEventClick={onEventClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function DateCell({
  cell,
  isToday,
  events,
  overflow,
  allEvents,
  onEventClick,
}: {
  cell: { date: Date; isCurrentMonth: boolean };
  isToday: boolean;
  events: CalendarEvent[];
  overflow: number;
  allEvents: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? allEvents : events;

  return (
    <div
      className={`min-h-[90px] border-b border-r border-border p-1.5 text-xs transition-colors ${
        cell.isCurrentMonth ? "bg-card" : "bg-surface/40"
      } last:border-r-0`}
    >
      {/* Date number */}
      <div className="mb-1 flex items-center justify-end">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
            isToday
              ? "bg-primary text-white"
              : cell.isCurrentMonth
              ? "text-foreground"
              : "text-muted/50"
          }`}
        >
          {cell.date.getDate()}
        </span>
      </div>

      {/* Events */}
      <div className="space-y-0.5">
        {shown.map((ev) => (
          <EventChip key={ev.id} event={ev} onClick={() => onEventClick(ev)} />
        ))}
        {!expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted hover:bg-surface transition-colors"
          >
            +{overflow} more
          </button>
        )}
        {expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-muted hover:bg-surface transition-colors"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const color = eventColor(event.type, event.isOverdue);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80"
      style={{ backgroundColor: color.bg, color: color.text }}
      title={event.title}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
      />
      <span className="truncate">{event.title}</span>
    </button>
  );
}
