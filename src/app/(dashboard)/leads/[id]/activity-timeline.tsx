import {
  PlusCircle,
  Phone,
  Pencil,
  UserCog,
  Flag,
  FileCheck2,
  Mic,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LeadEvent } from "@/server/services/lead";
import { FollowUpActions } from "./follow-up-actions";

const ICON: Record<LeadEvent["kind"], LucideIcon> = {
  created: PlusCircle,
  followup: Phone,
  edited: Pencil,
  reassigned: UserCog,
  status: Flag,
  converted: FileCheck2,
  comm: MessageSquare,
};

/**
 * Merged lead activity. Two-column layout — a fixed icon/rail column and a
 * flexible content column — so nothing is clipped at the container edge (the
 * previous negative-margin approach cut off the leading text of compact events).
 */
export function ActivityTimeline({ events, leadId }: { events: LeadEvent[]; leadId: string }) {
  return (
    <ol className="space-y-1">
      {events.map((e, i) => {
        const Icon = ICON[e.kind];
        const when = new Date(e.at).toLocaleString("en-IN");
        const isLast = i === events.length - 1;
        const rich = Boolean(e.comm || e.followUp);

        return (
          <li key={i} className="flex gap-3">
            {/* Rail: icon + connecting line to the next event. */}
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted">
                <Icon className="size-3.5" />
              </span>
              {!isLast && <span className="my-0.5 w-px flex-1 bg-border" />}
            </div>

            {/* Content — cards for comms/follow-ups, a compact line otherwise. */}
            <div className={`min-w-0 flex-1 ${rich ? "pb-2" : "pb-2 pt-1"}`}>
              {e.comm ? (
                (() => {
                  const s = e.comm.sentStatus;
                  const state =
                    e.comm.direction === "IN"
                      ? { label: "Received", variant: "ok" as const }
                      : s === "SENT"
                        ? { label: "Sent", variant: "ok" as const }
                        : s === "FAILED"
                          ? { label: "Send failed", variant: "danger" as const }
                          : { label: "Logged (not sent)", variant: "warn" as const };
                  return (
                    <Card className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">{e.comm.channel}</Badge>
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted">{when}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm">{e.comm.body}</p>
                    </Card>
                  );
                })()
              ) : e.followUp ? (
                <Card className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{e.followUp.type.replace(/_/g, " ")}</Badge>
                      {e.followUp.outcome && (
                        <Badge variant="primary">{e.followUp.outcome.replace(/_/g, " ")}</Badge>
                      )}
                      {e.followUp.audioUrl && <Mic className="size-3.5 text-muted" />}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted">{when}</span>
                      <FollowUpActions
                        leadId={leadId}
                        followUpId={e.followUp.id}
                        notes={e.followUp.notes}
                        nextDate={e.followUp.nextDate ? new Date(e.followUp.nextDate).toISOString().slice(0, 10) : null}
                        outcome={e.followUp.outcome}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{e.followUp.notes}</p>
                  {e.followUp.nextDate && (
                    <p className="mt-1 text-[11px] text-primary">
                      Next: {new Date(e.followUp.nextDate).toLocaleDateString("en-IN")}
                    </p>
                  )}
                  {e.followUp.geoAddress && <p className="text-[11px] text-muted">📍 {e.followUp.geoAddress}</p>}
                </Card>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">
                    {e.title}
                    {e.detail && <span className="text-muted"> {e.detail}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
