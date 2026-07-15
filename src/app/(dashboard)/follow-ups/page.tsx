import Link from "next/link";
import { CalendarClock, AlertTriangle, CalendarDays, Phone, ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { upcomingFollowUps, type UpcomingFollowUp, type FollowUpBucket } from "@/server/services/lead";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CALL: "Call",
  SITE_VISIT: "Site visit",
  MEETING: "Meeting",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  OTHER: "Follow-up",
};

const SECTIONS: { bucket: FollowUpBucket; title: string; icon: typeof CalendarClock; tone: string }[] = [
  { bucket: "overdue", title: "Overdue", icon: AlertTriangle, tone: "text-danger" },
  { bucket: "today", title: "Due today", icon: CalendarClock, tone: "text-warn" },
  { bucket: "upcoming", title: "Upcoming", icon: CalendarDays, tone: "text-primary" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function FollowUpsPage() {
  const session = await getSession();
  const all = await upcomingFollowUps(session);

  const counts = {
    overdue: all.filter((f) => f.bucket === "overdue").length,
    today: all.filter((f) => f.bucket === "today").length,
    upcoming: all.filter((f) => f.bucket === "upcoming").length,
  };

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${all.length} scheduled next-action${all.length === 1 ? "" : "s"} across your open leads`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile
          label="Overdue"
          value={counts.overdue}
          icon={AlertTriangle}
          tone={counts.overdue > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Due today"
          value={counts.today}
          icon={CalendarClock}
          tone={counts.today > 0 ? "warn" : "default"}
        />
        <StatTile label="Upcoming" value={counts.upcoming} icon={CalendarDays} tone="primary" />
      </div>

      {all.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={CalendarClock}
              title="No follow-ups scheduled"
              description="Schedule a follow-up from any lead to see it here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((sec) => {
            const rows = all.filter((f) => f.bucket === sec.bucket);
            if (rows.length === 0) return null;
            const Icon = sec.icon;
            return (
              <section key={sec.bucket}>
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={`size-4 ${sec.tone}`} />
                  <h2 className="text-sm font-semibold">{sec.title}</h2>
                  <span className="text-xs text-muted">({rows.length})</span>
                </div>
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {rows.map((f) => (
                      <FollowUpRow key={f.id} f={f} />
                    ))}
                  </CardContent>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FollowUpRow({ f }: { f: UpcomingFollowUp }) {
  const href = f.leadId ? `/leads/${f.leadId}` : "/leads";
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
    >
      <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center">
        <span className="text-[9px] font-semibold uppercase text-muted">
          {new Date(f.nextDate).toLocaleString("en-IN", { month: "short" })}
        </span>
        <span className="text-sm font-bold leading-none">{new Date(f.nextDate).getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{f.leadName}</span>
          <Badge>{TYPE_LABEL[f.type] ?? f.type}</Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" /> {fmtDate(f.nextDate)}
          </span>
          {f.leadPhone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" /> {f.leadPhone}
            </span>
          )}
          <span>Owner: {f.ownerName}</span>
        </div>
        {f.notes && <div className="mt-0.5 truncate text-xs text-muted/80">{f.notes}</div>}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
