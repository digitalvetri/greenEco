import {
  PlusCircle,
  FileText,
  Sparkles,
  CheckCircle2,
  Flag,
  Phone,
  Trophy,
  XCircle,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProposalEvent } from "@/server/services/proposal";

const ICON: Record<ProposalEvent["kind"], LucideIcon> = {
  created: PlusCircle,
  version: FileText,
  ai: Sparkles,
  approved: CheckCircle2,
  status: Flag,
  followup: Phone,
  won: Trophy,
  lost: XCircle,
  comm: MessageSquare,
};

/**
 * Proposal activity — version history (with grand-total deltas = the negotiation
 * price trail), approvals, follow-ups, status changes, and Won/Lost, newest-first.
 * Two-column flex rail (the v15 pattern) so nothing clips.
 */
export function ProposalTimeline({ events }: { events: ProposalEvent[] }) {
  return (
    <ol className="space-y-1">
      {events.map((e, i) => {
        const Icon = ICON[e.kind];
        const when = new Date(e.at).toLocaleString("en-IN");
        const isLast = i === events.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted">
                <Icon className="size-3.5" />
              </span>
              {!isLast && <span className="my-0.5 w-px flex-1 bg-border" />}
            </div>

            <div className="min-w-0 flex-1 pb-2 pt-1">
              {e.comm ? (
                <Card className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{e.comm.channel}</Badge>
                      <Badge variant={e.comm.sentStatus === "SENT" ? "ok" : "warn"}>
                        {e.comm.sentStatus === "SENT" ? "Sent to client" : "Logged (not sent)"}
                      </Badge>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">{when}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{e.comm.body}</p>
                </Card>
              ) : e.followUp ? (
                <Card className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{e.followUp.type.replace(/_/g, " ")}</Badge>
                      {e.followUp.outcome && <Badge variant="primary">{e.followUp.outcome.replace(/_/g, " ")}</Badge>}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">{when}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{e.followUp.notes}</p>
                  {e.followUp.nextDate && (
                    <p className="mt-1 text-[11px] text-primary">
                      Next: {new Date(e.followUp.nextDate).toLocaleDateString("en-IN")}
                    </p>
                  )}
                </Card>
              ) : e.amount || e.delta ? (
                // Version event — show the value and the price delta (negotiation trail).
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">
                    <span className="font-medium">{e.title}</span>
                    {e.detail && <span className="text-muted"> · {e.detail}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    {e.delta && (
                      <span className={`inline-flex items-center gap-0.5 text-xs ${e.delta.dir === "up" ? "text-danger" : "text-ok"}`}>
                        {e.delta.dir === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {e.delta.label}
                      </span>
                    )}
                    {e.amount && <span className="font-semibold tabular-nums">{e.amount}</span>}
                  </span>
                </div>
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
