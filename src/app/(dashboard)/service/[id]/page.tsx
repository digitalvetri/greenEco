import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, AlertCircle, MapPin } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getContract, amcActivity } from "@/server/services/amc";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { CompleteVisit, GenerateAmcInvoiceButton } from "./visit-widgets";
import { ContractStatusControl } from "./status-control";
import { TabPanels } from "./tab-panels";
import { AmcTimeline } from "./amc-timeline";
import { CommPanel } from "./comm-panel";

export const dynamic = "force-dynamic";

const VISIT_ICON = { DONE: CheckCircle2, DUE: AlertCircle, MISSED: AlertCircle, UPCOMING: Clock };
const VISIT_VARIANT = { DONE: "ok", DUE: "warn", MISSED: "danger", UPCOMING: "default" } as const;

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [c, activity] = await Promise.all([getContract(session, id), amcActivity(session, id)]);
  if (!c) notFound();
  const isAdmin = session.role === "ADMIN";
  const done = c.visits.filter((v) => v.status === "DONE").length;
  const clientEmail = c.order && "proposal" in c.order ? c.order.proposal?.lead?.email : null;
  const hasPhone = Boolean(c.order); // phone resolves via order→proposal→lead

  return (
    <div className="max-w-3xl gc-animate-in">
      <PageHeader
        title={c.clientName}
        subtitle={`${c.contractNo} · ${c.siteAddress}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={c.liveStatus === "ACTIVE" ? "ok" : c.liveStatus === "EXPIRED" ? "danger" : "default"}>{c.liveStatus}</Badge>
            {isAdmin && (
              <ContractStatusControl
                contractId={c.id}
                status={c.status}
                canRenew={c.liveStatus === "EXPIRED" || (c.liveStatus === "ACTIVE" && c.daysToExpiry <= 90)}
              />
            )}
            {isAdmin && c.order && <GenerateAmcInvoiceButton contractId={c.id} />}
          </div>
        }
      />

      <TabPanels
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Mini label="Frequency" value={c.frequency.replace(/_/g, " ")} />
                  <Mini label="Visits done" value={`${done} / ${c.visits.length}`} />
                  <Mini label="Days to expiry" value={c.daysToExpiry > 0 ? `${c.daysToExpiry}d` : "expired"} />
                  {isAdmin && "annualValue" in c && (
                    <Mini label="Annual value" value={formatINR((c as { annualValue: string }).annualValue)} />
                  )}
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Contract</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Term</span>
                      <span>{new Date(c.startDate).toLocaleDateString("en-IN")} → {new Date(c.endDate).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Visits / year</span>
                      <span>{c.visitsPerYear}</span>
                    </div>
                    {c.order && (
                      <Link href={`/projects/${c.order.id}`} className="inline-block pt-1 text-primary hover:underline">
                        View project {c.order.orderNo} →
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            key: "schedule",
            label: "Schedule",
            count: c.visits.length,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Preventive-Maintenance Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  {c.visits.map((v) => {
                    const status = v.liveStatus as keyof typeof VISIT_ICON;
                    const Icon = VISIT_ICON[status];
                    const readings = v.readings as Record<string, number> | null;
                    return (
                      <div key={v.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-border py-2.5">
                        <div className="flex items-start gap-2">
                          <Icon className={"mt-0.5 size-4 " + (status === "DONE" ? "text-ok" : status === "MISSED" ? "text-danger" : status === "DUE" ? "text-warn" : "text-muted")} />
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                              Visit {v.seq}
                              <Badge variant={VISIT_VARIANT[status]}>{status}</Badge>
                            </div>
                            <div className="text-xs text-muted">
                              {v.actualDate
                                ? `Done ${new Date(v.actualDate).toLocaleDateString("en-IN")}`
                                : `Scheduled ${new Date(v.scheduledDate).toLocaleDateString("en-IN")}`}
                            </div>
                            {readings && Object.keys(readings).length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {Object.entries(readings).map(([k, val]) => (
                                  <Badge key={k} variant="default">{k}: {val}</Badge>
                                ))}
                              </div>
                            )}
                            {v.notes && <p className="mt-1 text-xs text-foreground/80">{v.notes}</p>}
                            {v.lat && (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                                <MapPin className="size-3" /> {v.lat.toFixed(4)}, {v.lng?.toFixed(4)}
                              </span>
                            )}
                          </div>
                        </div>
                        {v.status !== "DONE" && <CompleteVisit contractId={c.id} visitId={v.id} />}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ),
          },
          {
            key: "tickets",
            label: "Tickets",
            count: c.tickets.length,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Tickets on this contract</CardTitle>
                </CardHeader>
                <CardContent>
                  {c.tickets.length === 0 ? (
                    <p className="text-sm text-muted">No tickets.</p>
                  ) : (
                    c.tickets.map((t) => (
                      <div key={t.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                        <div>
                          <span className="font-mono text-xs text-muted">{t.ticketNo}</span> {t.title}
                        </div>
                        <Badge variant={t.status === "RESOLVED" || t.status === "CLOSED" ? "ok" : "warn"}>{t.status.replace(/_/g, " ")}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            key: "activity",
            label: "Activity",
            count: activity?.length ?? 0,
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Client communication</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CommPanel contractId={c.id} hasEmail={Boolean(clientEmail)} hasPhone={hasPhone} />
                  </CardContent>
                </Card>
                <AmcTimeline events={activity ?? []} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
