import { getSession } from "@/lib/auth";
import { itemOptions, listMaterialRequests, pendingRequestCount } from "@/server/services/materials";
import { listOrders } from "@/server/services/order";
import { PageHeader } from "@/components/ui/stat";
import { MaterialsNav } from "../materials-nav";
import { RequestsPanel } from "../requests-panel";

export const dynamic = "force-dynamic";

/**
 * Materials → Requests. Open to EVERY role — this is the field-staff flow.
 *
 * `createMaterialRequest`/`listMaterialRequests` are the only materials services with no
 * `requireAdmin` (the request deliberately carries no prices), but the UI used to render
 * them inside the admin-gated tools block, so employees could never reach them. `listOrders`
 * is already RBAC-scoped, so an employee only sees the projects they're assigned to.
 */
export default async function RequestsPage() {
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const [opts, orders, requests, pending] = await Promise.all([
    itemOptions(session),
    listOrders(session, { take: 100 }),
    listMaterialRequests(session),
    pendingRequestCount(session),
  ]);

  return (
    <div>
      <PageHeader
        title="Material requests"
        subtitle={isAdmin ? "Requests from the field — transfer from stock or convert to a PO" : "Ask the office for material on your projects"}
      />
      <MaterialsNav isAdmin={isAdmin} requestCount={pending} />

      <RequestsPanel
        items={opts.map((i) => ({ id: i.id, name: i.name }))}
        orders={orders.items.map((o) => ({ id: o.id, orderNo: o.orderNo, clientName: o.clientName }))}
        requests={requests.map((r) => ({
          id: r.id,
          orderNo: r.order.orderNo,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          items: (r.items as { itemId: string; qty: number }[]) ?? [],
        }))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
