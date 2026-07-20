"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, List, SlidersHorizontal, X } from "lucide-react";
import type { CalendarEvent } from "@/server/services/calendar";
import { ALL_EVENT_TYPES } from "./event-colors";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";
import { DayView } from "./day-view";
import { EventModal } from "./event-modal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type View = "month" | "week" | "day";

export function CalendarView({
  initialEvents,
  year,
  month,
  view,
  todayISO,
  filters,
}: {
  initialEvents: CalendarEvent[];
  year: number;
  month: number;
  view: View;
  todayISO: string; // server-seeded — no Date.now() in render
  filters: { type: string; owner: string; status: string };
}) {
  const router = useRouter();
  const pathname = usePathname();

  // "today" key in local format — used for highlighting the current day cell
  const todayKey = new Date(todayISO).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const todayDate = new Date(todayISO);

  // Selected day for week/day views (defaults to today if in current month, else 1st)
  const [selectedDay, setSelectedDay] = useState(() => {
    if (todayDate.getFullYear() === year && todayDate.getMonth() + 1 === month) {
      return todayDate.getDate();
    }
    return 1;
  });

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // ── URL navigation ────────────────────────────────────────────────────────
  const push = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        view,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.owner ? { owner: filters.owner } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...overrides,
      });
      // Remove empty values
      for (const [k, v] of Array.from(params.entries())) {
        if (!v) params.delete(k);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, year, month, view, filters],
  );

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    push({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
  }
  function nextMonth() {
    const d = new Date(year, month, 1);
    push({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
  }
  function goToToday() {
    push({
      year: String(todayDate.getFullYear()),
      month: String(todayDate.getMonth() + 1),
    });
  }
  function setView(v: View) {
    push({ view: v });
  }
  function setFilter(key: string, value: string) {
    push({ [key]: value });
  }
  function clearFilters() {
    push({ type: "", owner: "", status: "" });
  }

  const isCurrentMonth =
    year === todayDate.getFullYear() && month === todayDate.getMonth() + 1;

  // Stats for subtitle
  const total = initialEvents.length;
  const overdueCount = initialEvents.filter((e) => e.isOverdue).length;
  const activeFilters = [filters.type, filters.owner, filters.status].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <p className="text-sm text-muted">
            {total} event{total !== 1 ? "s" : ""}
            {overdueCount > 0 && (
              <span className="ml-2 font-medium text-danger">
                · {overdueCount} overdue
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View switcher */}
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-white"
                    : "text-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showFilters || activeFilters > 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFilters > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                {activeFilters}
              </span>
            )}
          </button>

          {/* Month nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-surface"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={goToToday}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCurrentMonth
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:bg-surface"
              }`}
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-surface"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
          {/* Event type */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted">Type:</label>
            <select
              value={filters.type}
              onChange={(e) => setFilter("type", e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All</option>
              {ALL_EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted">Status:</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-danger transition-colors"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {ALL_EVENT_TYPES.map((t) => (
          <div key={t.value} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            <span className="text-[11px] text-muted">{t.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          <span className="text-[11px] text-muted">Overdue</span>
        </div>
      </div>

      {/* ── Week/Day day picker ──────────────────────────────────────────── */}
      {(view === "week" || view === "day") && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Jump to day:</span>
          <input
            type="number"
            min={1}
            max={new Date(year, month, 0).getDate()}
            value={selectedDay}
            onChange={(e) =>
              setSelectedDay(
                Math.max(1, Math.min(new Date(year, month, 0).getDate(), parseInt(e.target.value, 10) || 1)),
              )
            }
            className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* ── Calendar grid ───────────────────────────────────────────────── */}
      {view === "month" && (
        <MonthGrid
          year={year}
          month={month}
          events={initialEvents}
          todayKey={todayKey}
          onEventClick={setSelectedEvent}
        />
      )}
      {view === "week" && (
        <WeekGrid
          year={year}
          month={month}
          selectedDay={selectedDay}
          events={initialEvents}
          todayKey={todayKey}
          onEventClick={setSelectedEvent}
        />
      )}
      {view === "day" && (
        <DayView
          year={year}
          month={month}
          selectedDay={selectedDay}
          events={initialEvents}
          todayKey={todayKey}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ── Event detail modal ───────────────────────────────────────────── */}
      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
