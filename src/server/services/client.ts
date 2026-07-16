import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";

/**
 * Client 360 (spec §7.3), keyed by the origin lead id. Merges the full history:
 * identity + contacts + reference graph + chronological timeline (lead & proposal
 * follow-ups) + commercial history (proposal, order, invoices, receipts) +
 * execution record. Pricing/cost fields stripped for EMPLOYEE.
 */
export async function getClient360(ctx: Ctx, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId },
    include: {
      contacts: true,
      reference: { include: { leads: { select: { id: true, customerName: true } } } },
      followUps: { orderBy: { datetime: "desc" } },
      proposal: {
        include: {
          versions: { orderBy: { versionNo: "desc" } },
          followUps: { orderBy: { datetime: "desc" } },
          order: {
            include: {
              milestones: { include: { receipts: true, invoice: true } },
              stages: { orderBy: { seq: "asc" } },
              documents: true,
              budget: true,
            },
          },
        },
      },
    },
  });
  if (!lead) return null;

  // Chronological merged timeline.
  const timeline: Array<{ kind: string; at: string; label: string; detail?: string }> = [];
  timeline.push({ kind: "lead", at: lead.createdAt.toISOString(), label: "Lead created", detail: lead.source });
  for (const f of lead.followUps) {
    timeline.push({ kind: "followup", at: f.datetime.toISOString(), label: `Follow-up (${f.type})`, detail: f.notes });
  }
  if (lead.proposal) {
    timeline.push({ kind: "proposal", at: lead.proposal.createdAt.toISOString(), label: `Proposal ${lead.proposal.number}`, detail: lead.proposal.status });
    for (const f of lead.proposal.followUps) {
      timeline.push({ kind: "followup", at: f.datetime.toISOString(), label: `Proposal follow-up (${f.type})`, detail: f.notes });
    }
    if (lead.proposal.order) {
      timeline.push({ kind: "order", at: lead.proposal.order.createdAt.toISOString(), label: `Order ${lead.proposal.order.orderNo}`, detail: lead.proposal.order.status });
      for (const m of lead.proposal.order.milestones) {
        for (const r of m.receipts) {
          timeline.push({ kind: "receipt", at: r.date.toISOString(), label: `Payment received`, detail: r.mode });
        }
        if (m.invoice) {
          timeline.push({ kind: "invoice", at: m.invoice.date.toISOString(), label: `Invoice ${m.invoice.invoiceNo}` });
        }
      }
    }
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  return stripPricing({ lead, timeline }, ctx.role);
}

export interface ClientFilters {
  search?: string;
  cursor?: string;
  take?: number;
}

function clientWhere(ctx: Ctx, search?: string): Prisma.LeadWhereInput {
  return {
    companyId: ctx.companyId,
    deletedAt: null,
    proposal: { isNot: null },
    ...(ctx.role !== "ADMIN" ? { OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { customerName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
                { address: { contains: search, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
  };
}

/**
 * "Clients" surface = leads that have a proposal (real customers), cursor-paginated
 * + searchable. Before this it was an unbounded findMany (bare array). Employee is
 * scoped to own/assigned. (A "client" is one lead's journey — true cross-lead 360 is P1.)
 */
export async function listClients(ctx: Ctx, filters: ClientFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const rows = await prisma.lead.findMany({
    where: clientWhere(ctx, filters.search),
    include: { proposal: { select: { number: true, status: true, order: { select: { orderNo: true, status: true } } } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = page.map((l) => ({
    id: l.id,
    customerName: l.customerName,
    phone: l.phone,
    address: l.address,
    proposalNo: l.proposal?.number ?? null,
    orderNo: l.proposal?.order?.orderNo ?? null,
  }));
  return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export interface ClientCustomerCard {
  /** Representative lead id (their most-recently-updated project) — see listLeadCustomers
   *  in lead.ts for why this is used as the URL key instead of the raw phone. */
  id: string;
  customerName: string;
  phone: string;
  address: string;
  projectCount: number;
  proposalNo: string | null;
  orderNo: string | null;
}

/**
 * Clients grouped by customer (phone) — same fix as Leads' listLeadCustomers, applied
 * here so a repeat customer with several projects shows one card, not one per project.
 * Grouped + paginated server-side (groupBy + offset), sharing clientWhere with the
 * hydration query so counts always match the hydrated rows.
 */
export async function listClientCustomers(
  ctx: Ctx,
  filters: ClientFilters & { offset?: number } = {},
): Promise<{ items: ClientCustomerCard[]; nextOffset: number | null }> {
  const take = Math.min(filters.take ?? 25, 100);
  const offset = filters.offset ?? 0;
  const where = clientWhere(ctx, filters.search);

  const groups = await prisma.lead.groupBy({
    by: ["phone"],
    where,
    _max: { updatedAt: true },
    orderBy: { _max: { updatedAt: "desc" } },
    skip: offset,
    take: take + 1,
  });
  const hasMore = groups.length > take;
  const page = hasMore ? groups.slice(0, take) : groups;
  if (page.length === 0) return { items: [], nextOffset: null };

  const phones = page.map((g) => g.phone);
  const leads = await prisma.lead.findMany({
    where: { ...where, phone: { in: phones } },
    include: { proposal: { select: { number: true, order: { select: { orderNo: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const byPhone = new Map<string, typeof leads>();
  for (const l of leads) {
    const g = byPhone.get(l.phone) ?? [];
    g.push(l);
    byPhone.set(l.phone, g);
  }

  const items: ClientCustomerCard[] = page.map((g) => {
    const group = byPhone.get(g.phone) ?? [];
    const latest = group[0]; // hydration query is ordered updatedAt desc
    return {
      id: latest.id,
      customerName: latest.customerName,
      phone: g.phone,
      address: latest.address,
      projectCount: group.length,
      proposalNo: latest.proposal?.number ?? null,
      orderNo: latest.proposal?.order?.orderNo ?? null,
    };
  });
  return { items, nextOffset: hasMore ? offset + take : null };
}

export interface ClientProjectTab {
  id: string;
  label: string;
  orderNo: string | null;
  proposalNo: string | null;
  status: string;
}

/**
 * Sibling projects for the Client 360 tab strip — every Lead sharing the anchor's
 * phone, scoped by the same clientWhere as the list (so an EMPLOYEE only sees tabs
 * for projects they themselves have access to). Empty array (not an error) when the
 * anchor isn't visible under clientWhere, so the caller can 404 without an existence leak.
 */
export async function listClientProjectTabs(ctx: Ctx, id: string): Promise<ClientProjectTab[]> {
  const where = clientWhere(ctx);
  const anchor = await prisma.lead.findFirst({ where: { ...where, id } });
  if (!anchor) return [];

  const leads = await prisma.lead.findMany({
    where: { ...where, phone: anchor.phone },
    include: { proposal: { select: { number: true, order: { select: { orderNo: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return leads.map((l, i) => ({
    id: l.id,
    label: `Project ${i + 1}`,
    orderNo: l.proposal?.order?.orderNo ?? null,
    proposalNo: l.proposal?.number ?? null,
    status: l.status,
  }));
}

export interface ClientAnalytics {
  uniqueCustomers: number; // distinct by phone (the dedup the list doesn't do yet)
  repeatCustomers: number; // customers with > 1 project
  totalLifetimeValue: number; // Σ order projectValue (sell-side)
  topClients: { name: string; phone: string; projects: number; value: number }[];
}

/**
 * Client analytics — the phone-keyed 360 the flat list doesn't do: aggregates every
 * engagement by customer phone (so a customer with two projects is ONE client here),
 * surfacing unique/repeat customers, LTV, and top clients by revenue. Sell-side
 * (projectValue); role-scoped like the list.
 */
export async function clientAnalytics(ctx: Ctx): Promise<ClientAnalytics> {
  const leads = await prisma.lead.findMany({
    where: clientWhere(ctx),
    select: { customerName: true, phone: true, proposal: { select: { order: { select: { status: true, projectValue: true } } } } },
  });
  const byPhone = new Map<string, { name: string; projects: number; value: Decimal }>();
  let totalLifetimeValue = new Decimal(0);
  for (const l of leads) {
    const key = l.phone.replace(/\D/g, "").slice(-10) || l.phone; // last 10 digits
    const g = byPhone.get(key) ?? { name: l.customerName, projects: 0, value: new Decimal(0) };
    const order = l.proposal?.order;
    if (order) {
      g.projects += 1;
      g.value = g.value.plus(new Decimal(order.projectValue));
      totalLifetimeValue = totalLifetimeValue.plus(new Decimal(order.projectValue));
    }
    byPhone.set(key, g);
  }
  const entries = [...byPhone.entries()];
  return {
    uniqueCustomers: entries.length,
    repeatCustomers: entries.filter(([, g]) => g.projects > 1).length,
    totalLifetimeValue: Math.round(totalLifetimeValue.toNumber()),
    topClients: entries
      .map(([phone, g]) => ({ name: g.name, phone, projects: g.projects, value: Math.round(g.value.toNumber()) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  };
}

export interface ClientStats {
  totalClients: number;
  activeProjects: number;
  lifetimeValue: number; // Σ order projectValue (sell-side) for clients in scope
}

/** Header KPIs. Scoped to the role's visible clients. projectValue is sell-side (visible). */
export async function clientStats(ctx: Ctx): Promise<ClientStats> {
  const leads = await prisma.lead.findMany({
    where: clientWhere(ctx),
    select: { proposal: { select: { order: { select: { status: true, projectValue: true } } } } },
  });
  let activeProjects = 0;
  let lifetimeValue = new Decimal(0);
  for (const l of leads) {
    const order = l.proposal?.order;
    if (order) {
      lifetimeValue = lifetimeValue.plus(new Decimal(order.projectValue));
      if (order.status === "ACTIVE") activeProjects += 1;
    }
  }
  return { totalClients: leads.length, activeProjects, lifetimeValue: Math.round(lifetimeValue.toNumber()) };
}
