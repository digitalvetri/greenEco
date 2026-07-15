import { Check, X, Clock } from "lucide-react";

/**
 * A simple, linear "where is this quote" tracker — plain everyday labels a
 * non-technical person can read at a glance, replacing the raw status code.
 * Happy path: Preparing → Sent → In discussion → Approved.
 * LOST / EXPIRED are shown as a clear coloured end-cap instead of "Approved".
 */
const STEPS = [
  { key: "DRAFT", label: "Preparing quote" },
  { key: "SENT", label: "Sent to customer" },
  { key: "UNDER_NEGOTIATION", label: "In discussion" },
  { key: "WON", label: "Approved" },
] as const;

const REACHED: Record<string, number> = {
  DRAFT: 0,
  SENT: 1,
  UNDER_NEGOTIATION: 2,
  WON: 3,
  // Negative terminals: they got at least sent to the customer.
  LOST: 1,
  EXPIRED: 1,
};

export function ProposalStageTracker({ status }: { status: string }) {
  const stopped = status === "LOST" || status === "EXPIRED";
  const reached = REACHED[status] ?? 0;

  // The final node changes when the quote didn't go through.
  const finalNode = stopped
    ? {
        label: status === "LOST" ? "Not proceeding" : "Quote expired",
        tone: status === "LOST" ? "danger" : ("warn" as const),
        icon: status === "LOST" ? X : Clock,
      }
    : { label: "Approved", tone: "ok" as const, icon: Check };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const isFinal = i === STEPS.length - 1;
          const done = !stopped && i < reached;
          const current = !stopped && i === reached;
          const reachedNeg = stopped && i <= reached; // steps actually reached before it stopped

          // Node appearance
          let circle = "border-border bg-surface text-muted";
          let content: React.ReactNode = i + 1;
          if (isFinal && stopped) {
            const FinalIcon = finalNode.icon;
            circle =
              finalNode.tone === "danger"
                ? "border-danger bg-danger text-white"
                : "border-warn bg-warn text-white";
            content = <FinalIcon className="size-4" strokeWidth={3} />;
          } else if (isFinal && status === "WON") {
            circle = "border-ok bg-ok text-white";
            content = <Check className="size-4" strokeWidth={3} />;
          } else if (done) {
            circle = "border-primary bg-primary text-primary-foreground";
            content = <Check className="size-4" strokeWidth={3} />;
          } else if (current) {
            circle = "border-primary bg-primary-50 text-primary ring-4 ring-primary/15";
          } else if (reachedNeg && !isFinal) {
            circle = "border-primary/40 bg-primary/10 text-primary";
          }

          // Connector to the previous node
          const connectorActive = i > 0 && (i <= reached || (stopped && i <= reached));

          const label = isFinal && stopped ? finalNode.label : step.label;
          const labelTone =
            current || (isFinal && (status === "WON" || stopped))
              ? "font-semibold text-foreground"
              : done || reachedNeg
                ? "text-foreground"
                : "text-muted";

          return (
            <li key={step.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* left connector */}
                <div
                  className={
                    "h-0.5 flex-1 " +
                    (i === 0 ? "opacity-0" : connectorActive ? "bg-primary" : "bg-border")
                  }
                />
                <span
                  className={
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors " +
                    circle
                  }
                >
                  {content}
                </span>
                {/* right connector */}
                <div
                  className={
                    "h-0.5 flex-1 " +
                    (isFinal ? "opacity-0" : i < reached ? "bg-primary" : "bg-border")
                  }
                />
              </div>
              <span className={"mt-2 px-1 text-center text-xs leading-tight " + labelTone}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
