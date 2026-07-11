import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listEntries, erectionActivity, budgetVsActual } from "@/server/services/erection";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { ErectionTimeline } from "./erection-timeline";

export const dynamic = "force-dynamic";

function statusTone(s: string) {
  if (s === "APPROVED") return "ok" as const;
  if (s === "REJECTED") return "danger" as const;
  if (s === "QUERIED") return "warn" as const;
  return "default" as const;
}

export default async function ProjectErectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Admin-only: this is a cross-author cost drill-in (BvA + every teammate's entry
  // amounts + the approval timeline). Field employees see only their own entries on
  // the main page; they have no path here (and erectionActivity/budgetVsActual throw).
  if (session.role !== "ADMIN") notFound();

  const order = await prisma.order.findFirst({
    where: { id, companyId: session.companyId },
    select: { id: true, orderNo: true, clientName: true, siteAddress: true },
  });
  if (!order) notFound();

  const [entryPage, activity, bva] = await Promise.all([
    listEntries(session, { orderId: id, take: 100 }),
    erectionActivity(session, id),
    budgetVsActual(session, id),
  ]);

  return (
    <div>
      <PageHeader
        title={order.clientName}
        subtitle={`${order.orderNo} · ${order.siteAddress}`}
        action={
          <Link href="/erection" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to erection
          </Link>
        }
      />

      {bva && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Budget vs Actual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <Stat label="Budget" value={formatINR(bva.budget)} />
              <Stat label="Spent" value={formatINR(bva.spent)} />
              <Stat label="Committed" value={formatINR(bva.committed)} tone="warn" />
              <Stat label="Remaining" value={formatINR(bva.remaining)} tone={Number(bva.remaining) < 0 ? "danger" : "ok"} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div className={"h-full " + (bva.pctConsumed >= 100 ? "bg-danger" : bva.pctConsumed >= 90 ? "bg-warn" : "bg-primary")} style={{ width: `${Math.min(bva.pctConsumed, 100)}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted">{bva.pctConsumed}% consumed</span>
              <a href={`/print/closeout/${order.id}`} target="_blank" rel="noreferrer" className="text-primary">Close-out PDF →</a>
            </div>
            {bva.alert && <div className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs text-danger">⚠ {bva.alert}</div>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entries ({entryPage.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entryPage.items.length === 0 ? (
              <p className="text-sm text-muted">No entries for this project.</p>
            ) : (
              entryPage.items.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-t border-border py-2 text-sm first:border-0">
                  <div>
                    <Badge variant="primary">{e.type.replace(/_/g, " ")}</Badge>
                    <span className="ml-2">{e.description}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatINR(e.amount.toString())}</div>
                    <Badge variant={statusTone(e.status)}>{e.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ErectionTimeline events={activity ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" | "ok" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "";
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={"font-bold tabular-nums " + c}>{value}</div>
    </div>
  );
}
