import type { Metadata } from "next";
import { DraftingCompass, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/rbac";
import { listDrawingRequests, drawingStats } from "@/server/services/drawing";
import { listOrders } from "@/server/services/order";
import { listLeads, listCompanyUsers } from "@/server/services/lead";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { DrawingsNav } from "./drawings-nav";
import { RequestDrawingCard } from "./request-drawing-card";
import { DrawingRequestsList, type DrawingRequestRow } from "./drawing-requests-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Drawings — Green Ecocare CRM" };

/**
 * The Drawings module — the request queue is the front door.
 *
 * Everyone reaches this route. What they can DO here depends on the `DRAWINGS`
 * capability (granted per user in Settings → Users): holders see and action the whole
 * queue, everyone else sees only requests they raised. The service enforces that; this
 * page only decides what to render.
 */
export default async function DrawingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; search?: string }>;
}) {
  const { status, view, search } = await searchParams;
  const session = await getSession();
  const canDraw = hasCapability(session, CAPABILITIES.DRAWINGS);

  const [{ items, nextCursor }, stats, orders, leads, members] = await Promise.all([
    listDrawingRequests(session, {
      status: status || undefined,
      view: view || undefined,
      search: search || undefined,
      take: 50,
    }),
    drawingStats(session),
    // Both are already RBAC-scoped, so the pickers can't offer work the user
    // has no business attaching a request to.
    listOrders(session, { take: 200 }),
    listLeads(session, { take: 200 }),
    canDraw ? listCompanyUsers(session) : Promise.resolve([]),
  ]);

  const rows: DrawingRequestRow[] = items.map((r) => ({
    id: r.id,
    title: r.title,
    discipline: r.discipline,
    purpose: r.purpose,
    notes: r.notes,
    status: r.status,
    priority: r.priority,
    changeReason: r.changeReason,
    dueDate: r.dueDate?.toISOString() ?? null,
    // Derived by the service, not here — a Date.now() in render is impure.
    overdue: r.overdue,
    createdAt: r.createdAt.toISOString(),
    requestedById: r.requestedById,
    assignedToId: r.assignedToId,
    project: r.order ? { id: r.order.id, label: r.order.clientName || r.order.orderNo } : null,
    enquiry: r.lead ? { id: r.lead.id, label: r.lead.customerName } : null,
    latestDrawing: r.drawings[0]
      ? {
          id: r.drawings[0].id,
          revision: r.drawings[0].revision,
          fileUrl: r.drawings[0].fileUrl,
          approvalStatus: r.drawings[0].approvalStatus,
        }
      : null,
  }));

  return (
    <div>
      <PageHeader
        title="Drawings"
        subtitle={
          canDraw
            ? `${stats.open} open · ${stats.overdue} overdue`
            : "Request an AutoCAD drawing and track it here"
        }
      />
      <DrawingsNav canDraw={canDraw} openCount={stats.open} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open requests" value={stats.open} icon={DraftingCompass} tone="primary" href="/drawings?status=open" />
        <StatTile label="Waiting on you" value={stats.awaitingMe} icon={Clock} tone={stats.awaitingMe > 0 ? "warn" : "default"} href="/drawings?status=DELIVERED" />
        <StatTile label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue > 0 ? "danger" : "default"} href="/drawings?view=overdue" />
        <StatTile label="Completed" value={stats.completed} icon={CheckCircle2} tone="ok" href="/drawings?status=COMPLETED" />
      </div>

      <div className="mb-4">
        <RequestDrawingCard
          canDraw={canDraw}
          projects={orders.items.map((o) => ({ id: o.id, label: `${o.clientName || o.orderNo} (${o.orderNo})` }))}
          enquiries={leads.items.map((l) => ({ id: l.id, label: `${l.customerName} — ${l.address}` }))}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
        />
      </div>

      <DrawingRequestsList
        key={`${status ?? ""}-${view ?? ""}-${search ?? ""}`}
        initialItems={rows}
        initialCursor={nextCursor}
        status={status ?? ""}
        view={view ?? ""}
        canDraw={canDraw}
        isAdmin={session.role === "ADMIN"}
        currentUserId={session.userId}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
