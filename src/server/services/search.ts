import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";

export interface SearchHit {
  type: "Lead" | "Proposal" | "Project" | "Item" | "Invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global search (spec §Cross-cutting) across clients, leads, projects, items,
 * invoices. RBAC-aware: EMPLOYEE is scoped to their own leads/projects and never
 * sees invoices (admin-only). Case-insensitive contains match.
 */
export async function searchAll(ctx: Ctx, q: string): Promise<SearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const contains = { contains: query, mode: "insensitive" as const };
  const isAdmin = ctx.role === "ADMIN";
  const empScope = isAdmin ? {} : { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] };

  const [leads, proposals, orders, items, invoices] = await Promise.all([
    prisma.lead.findMany({
      where: { companyId: ctx.companyId, deletedAt: null, ...empScope, OR: [{ customerName: contains }, { phone: { contains: query } }, { address: contains }] },
      take: 5,
      select: { id: true, customerName: true, phone: true, status: true },
    }),
    prisma.proposal.findMany({
      where: { companyId: ctx.companyId, OR: [{ projectName: contains }, { number: { contains: query } }] },
      take: 5,
      select: { id: true, number: true, projectName: true, status: true },
    }),
    prisma.order.findMany({
      where: {
        companyId: ctx.companyId,
        ...(isAdmin ? {} : { team: { some: { userId: ctx.userId } } }),
        OR: [{ clientName: contains }, { orderNo: { contains: query } }, { siteAddress: contains }],
      },
      take: 5,
      select: { id: true, orderNo: true, clientName: true },
    }),
    prisma.item.findMany({
      where: { companyId: ctx.companyId, OR: [{ name: contains }, { category: contains }] },
      take: 5,
      select: { id: true, name: true, category: true, unit: true },
    }),
    isAdmin
      ? prisma.invoice.findMany({
          where: { companyId: ctx.companyId, invoiceNo: { contains: query } },
          take: 5,
          select: { id: true, invoiceNo: true, total: true },
        })
      : Promise.resolve([]),
  ]);

  const hits: SearchHit[] = [];
  for (const l of leads)
    hits.push({ type: "Lead", id: l.id, title: l.customerName, subtitle: `${l.phone} · ${l.status.replace(/_/g, " ")}`, href: `/leads/${l.id}` });
  for (const p of proposals)
    hits.push({ type: "Proposal", id: p.id, title: p.projectName, subtitle: `${p.number} · ${p.status}`, href: `/proposals/${p.id}` });
  for (const o of orders)
    hits.push({ type: "Project", id: o.id, title: o.clientName, subtitle: o.orderNo, href: `/projects/${o.id}` });
  for (const i of items)
    hits.push({ type: "Item", id: i.id, title: i.name, subtitle: `${i.category} · ${i.unit}`, href: `/materials` });
  for (const inv of invoices)
    hits.push({ type: "Invoice", id: inv.id, title: inv.invoiceNo, subtitle: "Tax invoice", href: `/print/invoice/${inv.invoiceNo}` });

  return hits;
}
