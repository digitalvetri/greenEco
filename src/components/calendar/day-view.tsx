"use client";

import type { CalendarEvent } from "@/server/services/calendar";
import { eventColor } from "./event-colors";
import { Clock, User, FileText } from "lucide-react";

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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DayView({
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
  const dayDate = new Date(year, month - 1, selectedDay);
  const dayKey = dayDate.toLocaleDateString("en-CA");
  const isToday = dayKey === todayKey;

  const dayEvents = events.filter((ev) => toISTKey(ev.date) === dayKey);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Day header */}
      <div
        className={`px-5 py-4 border-b border-border ${isToday ? "bg-primary/5" : ""}`}
      >
        <div className="text-sm font-semibold text-muted">
          {DAY_NAMES[dayDate.getDay()]}
        </div>
        <div className="text-2xl font-bold">
          {selectedDay} {MONTH_NAMES[month - 1]} {year}
        </div>
        {isToday && (
          <div className="mt-1 text-xs font-medium text-primary">Today</div>
        )}
      </div>

      {/* Events */}
      <div className="p-4">
        {dayEvents.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">
            No events scheduled for this day.
          </div>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((ev) => {
              const color = eventColor(ev.type, ev.isOverdue);
              return (
                <button
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className="w-full rounded-xl border border-border p-3 text-left hover:bg-surface transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color.bg }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ev.title}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: color.bg, color: color.text }}
                        >
                          {color.label}
                        </span>
                        {ev.isCompleted && (
                          <span className="text-[10px] font-medium text-emerald-600">
                            ✓ Completed
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {fmtTime(ev.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="size-3" /> {ev.ownerName}
                        </span>
                      </div>
                      {ev.subtitle && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-muted">
                          <FileText className="size-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{ev.subtitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
