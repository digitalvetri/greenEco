import { PlusCircle, CheckCircle2, AlertOctagon, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import type { ErectionEvent } from "@/server/services/erection";

const ICON: Record<ErectionEvent["kind"], LucideIcon> = {
  created: PlusCircle,
  review: CheckCircle2,
  overrun: AlertOctagon,
};

/** Per-project approval-activity timeline — entries logged, reviews, overrun acks. */
export function ErectionTimeline({ events }: { events: ErectionEvent[] }) {
  if (events.length === 0) {
    return <Card className="p-4 text-sm text-muted">No activity yet.</Card>;
  }
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
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">
                  {e.title}
                  {e.detail && <span className="text-muted"> · {e.detail}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {e.amount && <span className="text-sm font-semibold tabular-nums">{formatINR(e.amount)}</span>}
                  <span className="text-[11px] text-muted">{when}</span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
