"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  RotateCcw,
  Sparkles,
  X,
  ArrowRight,
} from "lucide-react";
import type { CalendarEvent, FollowUpBucket, FollowUpWorklist } from "@/server/services/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  completeFollowUpAction,
  rescheduleFollowUpAction,
  completeTaskAction,
  dismissTaskAction,
} from "./actions";

const TYPE_LABEL: Record<string, string> = {
  CALL: "Call",
  SITE_VISIT: "Site visit",
  MEETING: "Meeting",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  OTHER: "Follow-up",
  TASK: "Auto task",
};

const SECTION_META: Record<
  FollowUpBucket,
  { title: string; icon: typeof CalendarClock; tone: string }
> = {
  overdue: { title: "Overdue", icon: AlertTriangle, tone: "text-danger" },
  today: { title: "Due today", icon: CalendarClock, tone: "text-warn" },
  upcoming: { title: "Upcoming", icon: CalendarDays, tone: "text-primary" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Where clicking the row takes you. A task has no anchor of its own. */
function hrefFor(e: CalendarEvent) {
  if (e.leadId) return `/leads/${e.leadId}`;
  if (e.proposalId) return `/proposals/${e.proposalId}`;
  return null;
}

export function Worklist({ data }: { data: FollowUpWorklist }) {
  const total = data.counts.overdue + data.counts.today + data.counts.upcoming;

  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={CalendarClock}
            title="Nothing due"
            description="Schedule a follow-up from any lead or proposal and it appears here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {data.sections.map((sec) => {
        if (sec.events.length === 0) return null;
        const meta = SECTION_META[sec.bucket];
        const Icon = meta.icon;
        return (
          <section key={sec.bucket}>
            <div className="mb-2 flex items-center gap-2">
              <Icon className={`size-4 ${meta.tone}`} aria-hidden />
              <h2 className="text-sm font-semibold">{meta.title}</h2>
              <span className="text-xs text-muted">({sec.events.length})</span>
            </div>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {sec.events.map((e) => (
                  <Row key={`${e.entityType}-${e.id}`} e={e} />
                ))}
              </CardContent>
            </Card>
          </section>
        );
      })}

      {data.truncated && (
        <p className="text-xs text-muted">
          Showing the earliest items only — this list hit its row limit. Narrow it with the filters
          above to see the rest.
        </p>
      )}
    </div>
  );
}

function Row({ e }: { e: CalendarEvent }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const href = hrefFor(e);
  const isTask = e.entityType === "task";

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(done);
        router.refresh();
      } else {
        toast(r.error ?? "Failed", "error");
      }
    });

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center">
          <span className="text-[9px] font-semibold uppercase text-muted">
            {new Date(e.date).toLocaleString("en-IN", { month: "short" })}
          </span>
          <span className="text-sm font-bold leading-none">{new Date(e.date).getDate()}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {href ? (
              <Link href={href} className="truncate text-sm font-medium hover:underline">
                {e.title}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{e.title}</span>
            )}
            <Badge>{TYPE_LABEL[e.type] ?? e.type}</Badge>
            {isTask && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted"
                title="Raised automatically"
              >
                <Sparkles className="size-3" aria-hidden />
                auto
              </span>
            )}
            {e.isCompleted && <Badge variant="ok">Done</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" aria-hidden /> {fmt(e.date)}
            </span>
            <span>Owner: {e.ownerName}</span>
          </div>
          {e.subtitle && <div className="mt-0.5 truncate text-xs text-muted/80">{e.subtitle}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isTask ? (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Mark task done"
                title="Mark done"
                loading={pending}
                onClick={() => act(() => completeTaskAction(e.id), "Task marked done.")}
              >
                <Check className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Dismiss task"
                title="Dismiss"
                loading={pending}
                onClick={() => act(() => dismissTaskAction(e.id), "Task dismissed.")}
              >
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <>
              {!e.isCompleted && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Mark follow-up done"
                  title="Mark done"
                  loading={pending}
                  onClick={() => act(() => completeFollowUpAction(e.id), "Follow-up completed.")}
                >
                  <Check className="size-4" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Reschedule follow-up"
                title="Reschedule"
                onClick={() => setRescheduling(true)}
              >
                <RotateCcw className="size-4" />
              </Button>
            </>
          )}
          {href && (
            <Link
              href={href}
              aria-label={`Open ${e.title}`}
              className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
            >
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      {rescheduling && (
        <RescheduleDialog
          event={e}
          onClose={() => setRescheduling(false)}
          onDone={() => {
            setRescheduling(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RescheduleDialog({
  event,
  onClose,
  onDone,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  // Seed from the event's own date rather than `new Date()` in render — the repo's
  // react-hooks/purity rule, and it is the date the user is actually moving.
  const [when, setWhen] = useState(() => toLocalInput(event.date));
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog open onClose={onClose} title="Reschedule follow-up">
      <div className="space-y-3">
        <Field label="New date and time">
          <Input
            type="datetime-local"
            value={when}
            onChange={(ev) => setWhen(ev.target.value)}
          />
        </Field>
        <Field label="Update the note (optional)">
          <Input
            placeholder="Leave blank to keep the existing note"
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await rescheduleFollowUpAction(
                  event.id,
                  new Date(when).toISOString(),
                  notes.trim() || undefined,
                );
                if (r.ok) {
                  toast("Follow-up rescheduled.");
                  onDone();
                } else {
                  toast(r.error ?? "Failed", "error");
                }
              })
            }
          >
            Reschedule
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** ISO → the `datetime-local` shape, in the viewer's own timezone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
