import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { primaryProposal, realisedProposals, realisedValue } from "@/lib/domain/proposal-pick";
import { visibleProposalFilter } from "./proposal-visibility";

/**
 * Client 360 (spec §7.3), keyed by the origin lead id. Merges the full history:
 * identity + contacts + reference graph + chronological timeline (lead & proposal
 * follow-ups) + commercial history (proposals, orders, invoices, receipts) +
 * execution record. Pricing/cost fields stripped for EMPLOYEE.
 *
 * A lead now carries several proposals (one per type), so the timeline walks ALL
 * of them — previously it could only ever show the single 1:1 proposal.
 */
export async function getClient360(ctx: Ctx, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: ctx.companyId },
    include: {
      contacts: true,
      reference: { include: { leads: { select: { id: true, customerName: true } } } },
      followUps: { orderBy: { datetime: "desc" } },
      proposals: {
        where: visibleProposalFilter(ctx),
        orderBy: { createdAt: "desc" },
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
  for (const proposal of lead.proposals) {
    timeline.push({
      kind: "proposal",
      at: proposal.createdAt.toISOString(),
      label: `Proposal ${proposal.number}`,
      detail: [proposal.proposalType, proposal.status].filter(Boolean).join(" · "),
    });
    for (const f of proposal.followUps) {
      timeline.push({ kind: "followup", at: f.datetime.toISOString(), label: `Proposal follow-up (${f.type})`, detail: f.notes });
    }
    if (proposal.order) {
      timeline.push({ kind: "order", at: proposal.order.createdAt.toISOString(), label: `Order ${proposal.order.orderNo}`, detail: proposal.order.status });
      for (const m of proposal.order.milestones) {
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

  // The page's headline Commercial card + financials key off one proposal; the full
  // list stays on `lead.proposals` so nothing is hidden.
  const primary = primaryProposal(lead.proposals);
  return stripPricing({ lead, timeline, primaryProposalId: primary?.id ?? null }, ctx.role);
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
    // "is a client" = has at least one VISIBLE proposal (was `proposal: { isNot: null }`
    // when the relation was 1:1). Shared by every query in this file, so the list, the
    // cards, the tabs, the export and both analytics surfaces always agree.
    //
    // The visibility filter belongs here too, not just on the nested include: without
    // it an employee would see a lead listed as a client while its only proposal — an
    // office draft — is filtered out of the row, showing a client with no proposal.
    proposals: { some: visibleProposalFilter(ctx) ?? {} },
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
    include: {
      proposals: {
        where: visibleProposalFilter(ctx),
        select: { number: true, status: true, createdAt: true, order: { select: { orderNo: true, status: true } } },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = page.map((l) => {
    // Display-only: one representative proposal per row. `proposalCount` tells the
    // user when there's more behind it rather than silently showing one of several.
    const p = primaryProposal(l.proposals);
    return {
      id: l.id,
      customerName: l.customerName,
      phone: l.phone,
      address: l.address,
      proposalNo: p?.number ?? null,
      proposalCount: l.proposals.length,
      orderNo: p?.order?.orderNo ?? null,
    };
  });
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
 * Clients grouped by customer name — same fix as Leads' listLeadCustomers (and for
 * the identical reason: a repeat referrer/customer often submits a different site
 * phone per project, so phone-keyed grouping was splitting them across separate
 * cards — confirmed live, e.g. "Pipeline Audit Customer" shown 3x). Grouped +
 * paginated server-side (groupBy + offset), sharing clientWhere with the hydration
 * query so counts always match the hydrated rows.
 */
export async function listClientCustomers(
  ctx: Ctx,
  filters: ClientFilters & { offset?: number } = {},
): Promise<{ items: ClientCustomerCard[]; nextOffset: number | null }> {
  const take = Math.min(filters.take ?? 25, 100);
  const offset = filters.offset ?? 0;
  const where = clientWhere(ctx, filters.search);

  const groups = await prisma.lead.groupBy({
    by: ["customerName"],
    where,
    _max: { updatedAt: true },
    orderBy: { _max: { updatedAt: "desc" } },
    skip: offset,
    take: take + 1,
  });
  const hasMore = groups.length > take;
  const page = hasMore ? groups.slice(0, take) : groups;
  if (page.length === 0) return { items: [], nextOffset: null };

  const names = page.map((g) => g.customerName);
  const leads = await prisma.lead.findMany({
    where: { ...where, customerName: { in: names } },
    include: {
      proposals: { where: visibleProposalFilter(ctx), select: { number: true, status: true, createdAt: true, order: { select: { orderNo: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const byName = new Map<string, typeof leads>();
  for (const l of leads) {
    const g = byName.get(l.customerName) ?? [];
    g.push(l);
    byName.set(l.customerName, g);
  }

  const items: ClientCustomerCard[] = page.map((g) => {
    const group = byName.get(g.customerName) ?? [];
    const latest = group[0]; // hydration query is ordered updatedAt desc
    // projectCount stays lead-scoped: in this app a Lead IS one site/project, and a
    // proposal is a quote for it — one project can now carry several quotes.
    const p = primaryProposal(latest.proposals);
    return {
      id: latest.id,
      customerName: latest.customerName,
      phone: latest.phone,
      address: latest.address,
      projectCount: group.length,
      proposalNo: p?.number ?? null,
      orderNo: p?.order?.orderNo ?? null,
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
  /** Descriptive fields for the "know the client completely" summary — proposal's
   *  finalized values when a proposal exists, else the lead's own structured sizing. */
  projectName: string | null;
  plantType: string | null;
  technology: string | null;
  capacityKLD: number | null;
  segment: string | null;
  orderStatus: string | null;
  progress: number | null; // stages done/total, only once an Order exists
  /** Sell-side; page gates display behind isAdmin (this file's existing convention). */
  projectValue: string | null;
  startDate: string | null;
  targetDate: string | null;
}

function progressOf(stages: { status: string }[]): number {
  if (!stages.length) return 0;
  const done = stages.filter((s) => s.status === "DONE").length;
  return Math.round((done / stages.length) * 100);
}

/**
 * Sibling projects for the Client 360 tab strip — every Lead sharing the anchor's
 * exact customer name (see listClientCustomers for why name rather than phone),
 * scoped by the same clientWhere as the list (so an EMPLOYEE only sees tabs for
 * projects they themselves have access to). Empty array (not an error) when the
 * anchor isn't visible under clientWhere, so the caller can 404 without an existence leak.
 * Carries plant type/technology/capacity/status/progress/value for each project so the
 * client page can show a full "what has this client done with us" picture, not just codes.
 */
export async function listClientProjectTabs(ctx: Ctx, id: string): Promise<ClientProjectTab[]> {
  const where = clientWhere(ctx);
  const anchor = await prisma.lead.findFirst({ where: { ...where, id } });
  if (!anchor) return [];

  const leads = await prisma.lead.findMany({
    where: { ...where, customerName: anchor.customerName },
    include: {
      proposals: {
        where: visibleProposalFilter(ctx),
        select: {
          number: true,
          status: true,
          createdAt: true,
          projectName: true,
          plantType: true,
          technology: true,
          capacityKLD: true,
          order: {
            select: {
              orderNo: true,
              status: true,
              projectValue: true,
              startDate: true,
              targetDate: true,
              stages: { select: { status: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return leads.map((l, i) => {
    // One tab per Lead (= per site/project). Where a lead now has several quotes,
    // the tab describes it via the representative one; the client-360 page below
    // still lists every proposal.
    const p = primaryProposal(l.proposals);
    const order = p?.order;
    return {
      id: l.id,
      label: `Project ${i + 1}`,
      orderNo: order?.orderNo ?? null,
      proposalNo: p?.number ?? null,
      status: l.status,
      projectName: p?.projectName ?? l.projectName ?? null,
      plantType: p?.plantType ?? l.plantType ?? null,
      technology: p?.technology ?? l.technology ?? null,
      capacityKLD: p?.capacityKLD ?? l.capacityKLD ?? null,
      segment: l.segment ?? null,
      orderStatus: order?.status ?? null,
      progress: order ? progressOf(order.stages) : null,
      projectValue: order ? order.projectValue.toString() : null,
      startDate: order?.startDate?.toISOString() ?? null,
      targetDate: order?.targetDate?.toISOString() ?? null,
    };
  });
}

/**
 * Full client+project export (not just the visible/loaded page) — company-wide,
 * same 5000-row cap convention as allLeadsForExport. projectValue is sell-side,
 * admin-only (stripPricing handles the gate; EMPLOYEE gets it stripped).
 *
 * **One row per PROPOSAL, not per lead.** A lead can now carry several quotes
 * (Project Proposal + BOQ + AMC for one site), and picking just one would silently
 * drop rows from an export whose whole purpose is completeness. The customer/site
 * columns repeat across a lead's rows, which is what a flat export should do.
 * `clientWhere` guarantees every returned lead has at least one proposal.
 */
export async function allClientsForExport(ctx: Ctx, search?: string) {
  const rows = await prisma.lead.findMany({
    where: clientWhere(ctx, search),
    include: {
      proposals: {
        where: visibleProposalFilter(ctx),
        orderBy: { createdAt: "desc" },
        select: {
          number: true,
          status: true,
          proposalType: true,
          projectName: true,
          plantType: true,
          technology: true,
          capacityKLD: true,
          order: { select: { orderNo: true, status: true, projectValue: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });
  return stripPricing(rows, ctx.role).flatMap((l) =>
    l.proposals.map((p) => ({
      customerName: l.customerName,
      phone: l.phone,
      address: l.address,
      projectName: p.projectName ?? l.projectName ?? "",
      plantType: p.plantType ?? l.plantType ?? "",
      technology: p.technology ?? l.technology ?? "",
      capacityKLD: p.capacityKLD ?? l.capacityKLD ?? "",
      proposalNo: p.number,
      proposalType: p.proposalType ?? "",
      proposalStatus: p.status,
      orderNo: p.order?.orderNo ?? "",
      orderStatus: p.order?.status ?? "",
      projectValue: p.order?.projectValue?.toString() ?? "",
    })),
  );
}

export interface ClientAnalytics {
  uniqueCustomers: number; // distinct by customer name — see listClientCustomers for why
  repeatCustomers: number; // customers with > 1 project
  totalLifetimeValue: number; // Σ order projectValue (sell-side)
  topClients: { name: string; phone: string; projects: number; value: number }[];
}

/**
 * Client analytics — the 360 the flat list doesn't do: aggregates every engagement
 * by exact customer name (so a customer with two projects is ONE client here — same
 * identity key as listClientCustomers/listClientProjectTabs, kept consistent so this
 * page's unique/repeat counts always match what the list actually shows), surfacing
 * unique/repeat customers, LTV, and top clients by revenue. Sell-side (projectValue);
 * role-scoped like the list.
 */
export async function clientAnalytics(ctx: Ctx): Promise<ClientAnalytics> {
  const leads = await prisma.lead.findMany({
    where: clientWhere(ctx),
    select: {
      customerName: true,
      phone: true,
      proposals: {
        where: visibleProposalFilter(ctx),
        select: {
          status: true,
          createdAt: true,
          order: { select: { status: true, projectValue: true } },
          // A win can land in any of three modules — see realisedValue().
          contract: { select: { status: true, annualValue: true } },
          ticket: { select: { status: true, value: true } },
        },
      },
    },
  });
  const byName = new Map<string, { phone: string; projects: number; value: Decimal }>();
  let totalLifetimeValue = new Decimal(0);
  for (const l of leads) {
    const g = byName.get(l.customerName) ?? { phone: l.phone, projects: 0, value: new Decimal(0) };
    // Iterate EVERY won proposal, never proposals[0] — a lead can carry several won
    // quotes, each landing in a different module. Each link (order/contract/ticket) is
    // @unique on the proposal, so summing per-proposal cannot double-count.
    // `projects` counts realised wins so it stays consistent with the `value` beside it.
    for (const p of realisedProposals(l.proposals)) {
      const v = new Decimal(realisedValue(p));
      g.projects += 1;
      g.value = g.value.plus(v);
      totalLifetimeValue = totalLifetimeValue.plus(v);
    }
    byName.set(l.customerName, g);
  }
  const entries = [...byName.entries()];
  return {
    uniqueCustomers: entries.length,
    repeatCustomers: entries.filter(([, g]) => g.projects > 1).length,
    totalLifetimeValue: Math.round(totalLifetimeValue.toNumber()),
    topClients: entries
      .map(([name, g]) => ({ name, phone: g.phone, projects: g.projects, value: Math.round(g.value.toNumber()) }))
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
    select: {
      proposals: {
        where: visibleProposalFilter(ctx),
        select: {
          status: true,
          createdAt: true,
          order: { select: { status: true, projectValue: true } },
          // A win can land in any of three modules — see realisedValue().
          contract: { select: { status: true, annualValue: true } },
          ticket: { select: { status: true, value: true } },
        },
      },
    },
  });
  let activeProjects = 0;
  let lifetimeValue = new Decimal(0);
  for (const l of leads) {
    // Same rule as clientAnalytics — every won proposal, whichever module it landed in.
    for (const p of realisedProposals(l.proposals)) {
      lifetimeValue = lifetimeValue.plus(new Decimal(realisedValue(p)));
      // "Active projects" stays projects only: an AMC has its own live-contract count
      // on the Service dashboard, and folding it in here would double-report it.
      if (p.order?.status === "ACTIVE") activeProjects += 1;
    }
  }
  return { totalClients: leads.length, activeProjects, lifetimeValue: Math.round(lifetimeValue.toNumber()) };
}
