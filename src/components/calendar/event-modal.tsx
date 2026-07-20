"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  X,
  CheckCircle2,
  CalendarClock,
  ExternalLink,
  RotateCcw,
  Clock,
  User,
  FileText,
} from "lucide-react";
import type { CalendarEvent } from "@/server/services/calendar";
import { eventColor } from "./event-colors";
import { completeFollowUpAction, rescheduleFollowUpAction } from "@/app/(dashboard)/calendar/actions";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function EventModal({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const color = eventColor(event.type, event.isOverdue);
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [newDate, setNewDate] = useState(() => {
    // Pre-fill with event's current date in IST as a local datetime-local value
    const d = new Date(event.date);
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleComplete() {
    if (event.entityType !== "follow-up") return;
    startTransition(async () => {
      const res = await completeFollowUpAction(event.id);
      if (res.ok) {
        setFeedback("Marked as completed ✓");
        setTimeout(onClose, 800);
      } else {
        setFeedback(res.error ?? "Failed");
      }
    });
  }

  function handleReschedule() {
    if (event.entityType !== "follow-up") return;
    if (!newDate) { setFeedback("Pick a date first"); return; }
    // Convert datetime-local (treated as IST) to UTC for storage
    const istMs = new Date(newDate).getTime() - 5.5 * 60 * 60 * 1000;
    const utcIso = new Date(istMs).toISOString();
    startTransition(async () => {
      const res = await rescheduleFollowUpAction(event.id, utcIso, notes || undefined);
      if (res.ok) {
        setFeedback("Rescheduled ✓");
        setTimeout(onClose, 800);
      } else {
        setFeedback(res.error ?? "Failed");
      }
    });
  }

  const entityLink = event.leadId
    ? `/leads/${event.leadId}`
    : event.proposalId
    ? `/proposals/${event.proposalId}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="gc-animate-in w-full max-w-md rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div
          className="flex items-center justify-between rounded-t-2xl px-4 py-3 sm:rounded-t-2xl"
          style={{ backgroundColor: color.bg }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: "rgba(0,0,0,0.2)", color: color.text }}
            >
              {color.label}
            </span>
            {event.isCompleted && (
              <span className="flex items-center gap-1 text-xs font-medium text-white/90">
                <CheckCircle2 className="size-3" /> Completed
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 transition-colors hover:bg-black/20"
            style={{ color: color.text }}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Title + link */}
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold leading-tight">{event.title}</h2>
            {entityLink && (
              <Link
                href={entityLink}
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors"
                title="Open lead/proposal"
              >
                <ExternalLink className="size-4" />
              </Link>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-1.5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0" />
              <span>{fmtDateTime(event.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="size-3.5 shrink-0" />
              <span>{event.ownerName}</span>
            </div>
            {event.subtitle && (
              <div className="flex items-start gap-2">
                <FileText className="size-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-3 leading-snug">{event.subtitle}</span>
              </div>
            )}
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="rounded-lg bg-surface px-3 py-2 text-xs font-medium text-foreground">
              {feedback}
            </div>
          )}

          {/* Reschedule form */}
          {mode === "reschedule" && event.entityType === "follow-up" && (
            <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
              <label className="text-xs font-medium text-muted">New date & time (IST)</label>
              <input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                placeholder="Add a note (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReschedule}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
                >
                  {isPending ? "Saving…" : "Save reschedule"}
                </button>
                <button
                  onClick={() => setMode("view")}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {mode === "view" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {event.entityType === "follow-up" && !event.isCompleted && (
                <button
                  onClick={handleComplete}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 className="size-3.5" />
                  {isPending ? "Saving…" : "Mark complete"}
                </button>
              )}
              {event.entityType === "follow-up" && (
                <button
                  onClick={() => setMode("reschedule")}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-surface"
                >
                  <CalendarClock className="size-3.5" />
                  Reschedule
                </button>
              )}
              {entityLink && (
                <Link
                  href={entityLink}
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-surface"
                >
                  <RotateCcw className="size-3.5" />
                  Open record
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
