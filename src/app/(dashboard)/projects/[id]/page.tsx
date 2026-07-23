import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getOrder, orderActivity } from "@/server/services/order";
import { budgetVsActual } from "@/server/services/erection";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { Decimal } from "decimal.js";
import { StageRow, DrawingUpload, MilestoneRow } from "./project-widgets";
import { TeamAssign, TeamRemove } from "./team-assign";
import { OrderStatusControl } from "./status-control";
import { TabPanels } from "./tab-panels";
import { ProjectTimeline } from "./project-timeline";
import { ProjectDocumentsCard } from "./documents-card";
import { CommPanel } from "./comm-panel";
import { ArchiveButton } from "./archive-button";
import { GstControl } from "./gst-control";
import { ScheduleControl, ValueControl, BudgetControl, InlineDateEdit } from "./schedule-value-controls";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const [order, activity] = await Promise.all([getOrder(session, id), orderActivity(session, id)]);
  if (!order) notFound();
  const documents = ("documents" in order ? order.documents : []) as { id: string; fileUrl: string; title: string }[];

  const currentDrawings = order.drawings.filter((d) => d.isCurrent);
  const clientEmail = order.proposal && "lead" in order.proposal ? order.proposal.lead?.email : null;
  const budget = "budget" in order ? order.budget : null;
  // Live spend-to-date (labour + purchases + other + consumption), not the static seeded
  // baseline — the Gross Margin card used to be projectValue − budget.baseAmount only,
  // which never moved as the project actually spent money.
  const bva = isAdmin && budget ? await budgetVsActual(session, order.id) : null;
  const users = isAdmin
    ? await prisma.user.findMany({ where: { companyId: session.companyId, active: true }, select: { id: true, name: true } })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div>
      <PageHeader
        title={order.clientName}
        subtitle={`${order.orderNo} · ${order.siteAddress}`}
        action={
          <div className="flex items-center gap-2">
            <Badge
              variant={
                order.status === "COMPLETED"
                  ? "ok"
                  : order.status === "CANCELLED"
                    ? "danger"
                    : order.status === "ON_HOLD"
                      ? "warn"
                      : "primary"
              }
            >
              {order.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-sm font-semibold">{order.progress}%</span>
          </div>
        }
      />

      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <OrderStatusControl orderId={order.id} status={order.status} />
          <ArchiveButton orderId={order.id} />
        </div>
      )}

      <TabPanels
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="space-y-4">
                {isAdmin && budget && bva && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted">Project Value</div>
                          <ValueControl orderId={order.id} projectValue={order.projectValue.toString()} />
                        </div>
                        <div className="text-lg font-bold">{formatINR(order.projectValue.toString())}</div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted">Budget</div>
                          <BudgetControl orderId={order.id} budget={bva.budget} />
                        </div>
                        <div className="text-lg font-bold">{formatINR(bva.budget)}</div>
                      </Card>
                      <Card className="p-3">
                        <div className="text-xs text-muted">Gross Margin (live)</div>
                        <div
                          className={
                            "text-lg font-bold " +
                            (new Decimal(order.projectValue)
                              .minus(bva.spent)
                              .minus(bva.committed)
                              .lt(0)
                              ? "text-danger"
                              : "text-ok")
                          }
                        >
                          {new Decimal(order.projectValue)
                            .minus(bva.spent)
                            .minus(bva.committed)
                            .div(order.projectValue)
                            .times(100)
                            .toFixed(0)}
                          %
                        </div>
                      </Card>
                    </div>
                    <Card className="p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-semibold text-muted">Actual spend to date</div>
                        <Link href={`/erection/${order.id}`} className="text-xs text-primary hover:underline">
                          Full breakdown →
                        </Link>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        <BudgetStat label="Spent" value={formatINR(bva.spent)} />
                        <BudgetStat label="Committed" value={formatINR(bva.committed)} tone="warn" />
                        <BudgetStat
                          label="Remaining"
                          value={formatINR(bva.remaining)}
                          tone={Number(bva.remaining) < 0 ? "danger" : "ok"}
                        />
                        <BudgetStat label="Consumed" value={`${bva.pctConsumed}%`} />
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className={
                            "h-full " +
                            (bva.pctConsumed >= 100 ? "bg-danger" : bva.pctConsumed >= 90 ? "bg-warn" : "bg-primary")
                          }
                          style={{ width: `${Math.min(bva.pctConsumed, 100)}%` }}
                        />
                      </div>
                      {bva.alert && (
                        <div className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs text-danger">⚠ {bva.alert}</div>
                      )}
                    </Card>
                  </>
                )}
                {isAdmin && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Customer GST (invoice place-of-supply)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <GstControl
                        orderId={order.id}
                        clientStateCode={"clientStateCode" in order ? (order as { clientStateCode: string | null }).clientStateCode : null}
                        clientGstin={"clientGstin" in order ? (order as { clientGstin: string | null }).clientGstin : null}
                      />
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Schedule</CardTitle>
                    {isAdmin && (
                      <ScheduleControl
                        orderId={order.id}
                        startDate={order.startDate ? new Date(order.startDate).toISOString() : null}
                        targetDate={order.targetDate ? new Date(order.targetDate).toISOString() : null}
                      />
                    )}
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted">Start date</div>
                      {isAdmin ? (
                        <InlineDateEdit
                          orderId={order.id}
                          field="startDate"
                          startDate={order.startDate ? new Date(order.startDate).toISOString() : null}
                          targetDate={order.targetDate ? new Date(order.targetDate).toISOString() : null}
                        />
                      ) : (
                        <div className="font-medium">
                          {order.startDate ? new Date(order.startDate).toLocaleDateString("en-IN") : "— not set"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-muted">Target completion</div>
                      {isAdmin ? (
                        <InlineDateEdit
                          orderId={order.id}
                          field="targetDate"
                          startDate={order.startDate ? new Date(order.startDate).toISOString() : null}
                          targetDate={order.targetDate ? new Date(order.targetDate).toISOString() : null}
                        />
                      ) : (
                        <div className="font-medium">
                          {order.targetDate ? new Date(order.targetDate).toLocaleDateString("en-IN") : "— not set"}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Team & Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {order.team.length === 0 && <p className="text-muted">No team assigned.</p>}
                    {order.team.map((t) => (
                      <div key={t.id} className="flex items-center justify-between">
                        <span>{userName.get(t.userId) ?? t.userId}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant="default">{t.role.replace(/_/g, " ")}</Badge>
                          {isAdmin && <TeamRemove orderId={order.id} userId={t.userId} name={userName.get(t.userId) ?? "member"} />}
                        </span>
                      </div>
                    ))}
                    {isAdmin && <TeamAssign orderId={order.id} users={users} />}
                    {order.proposal && (
                      <Link href={`/proposals/${order.proposal.id}`} className="mt-2 inline-block text-primary">
                        View proposal {order.proposal.number} →
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            key: "stages",
            label: "Stages",
            count: order.stages.length,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Execution Stages</CardTitle>
                </CardHeader>
                <CardContent>
                  {order.stages.map((s) => (
                    <StageRow
                      key={s.id}
                      orderId={order.id}
                      stage={{
                        id: s.id,
                        seq: s.seq,
                        name: s.name,
                        status: s.status,
                        plannedDate: s.plannedDate?.toISOString() ?? null,
                        actualDate: s.actualDate?.toISOString() ?? null,
                        notes: s.notes,
                        delayReason: s.delayReason,
                        photos: s.photos.map((p) => ({ id: p.id, url: p.url })),
                      }}
                    />
                  ))}
                </CardContent>
              </Card>
            ),
          },
          {
            key: "payments",
            label: "Payments",
            count: order.milestones.length,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Milestones</CardTitle>
                </CardHeader>
                <CardContent>
                  {order.milestones.map((m) => {
                    const received =
                      "receipts" in m ? m.receipts.reduce((a, r) => a.plus(r.amount), new Decimal(0)).toFixed(2) : "0";
                    return (
                      <MilestoneRow
                        key={m.id}
                        orderId={order.id}
                        isAdmin={isAdmin}
                        stages={order.stages.map((s) => ({ id: s.id, name: s.name }))}
                        milestone={{
                          id: m.id,
                          description: m.description,
                          amount: m.amount.toString(),
                          status: m.status,
                          received,
                          invoiceNo: m.invoice?.invoiceNo ?? null,
                          invoiceId: m.invoice?.id ?? null,
                          dueBasis: m.dueBasis,
                          dueDate: m.dueDate?.toISOString() ?? null,
                          linkedStageId: m.linkedStageId ?? null,
                        }}
                      />
                    );
                  })}
                </CardContent>
              </Card>
            ),
          },
          {
            key: "docs",
            label: "Drawings & Docs",
            count: currentDrawings.length + documents.length,
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Drawings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDrawings.length === 0 && <p className="text-sm text-muted">No drawings uploaded.</p>}
                    {currentDrawings.map((d) => (
                      <div key={d.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                        <a href={d.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-primary">
                          {d.title}
                        </a>
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Rev {d.revision}</Badge>
                          <Badge variant="ok">CURRENT</Badge>
                          <span className="text-xs text-muted">{d.approvalStatus}</span>
                        </div>
                      </div>
                    ))}
                    <DrawingUpload orderId={order.id} />
                  </CardContent>
                </Card>
                <ProjectDocumentsCard orderId={order.id} documents={documents} />
              </div>
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
                    <CommPanel orderId={order.id} phone={order.clientPhone} email={clientEmail ?? null} />
                  </CardContent>
                </Card>
                <ProjectTimeline events={activity ?? []} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function BudgetStat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" | "ok" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "";
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={"font-bold tabular-nums " + c}>{value}</div>
    </div>
  );
}
