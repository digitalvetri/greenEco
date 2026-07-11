import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { orderStats } from "./order";
import { amcAnalytics } from "./amc";
import { materialsStats } from "./materials";
import { erectionStats } from "./erection";

/**
 * Cross-module operations KPIs for the dashboard — REUSES the per-module analytics
 * services (not re-aggregated) so the tiles always match each module's own page.
 * Money surfaces are admin-only inside those services (null for EMPLOYEE).
 */
export async function getOpsKpis(ctx: Ctx) {
  const isAdmin = ctx.role === "ADMIN";
  const [orders, amc, materials, erection] = await Promise.all([
    orderStats(ctx),
    isAdmin ? amcAnalytics(ctx) : Promise.resolve(null),
    isAdmin ? materialsStats(ctx) : Promise.resolve(null),
    erectionStats(ctx),
  ]);
  return {
    receivables: orders.receivables, // sell-side (visible to all)
    overduePayments: orders.overduePayments,
    amcRunRate: amc?.recurringRevenue ?? null, // admin-only
    stockValue: materials?.stockValue ?? null, // admin-only
    lowStock: materials?.lowStockCount ?? null,
    erectionOverruns: erection.overrunProjects, // null for employee (from erectionStats)
  };
}

/**
 * Rich dashboard data (premium home). Wired to real GreenEco data across the
 * whole lifecycle: sell → build → operate → service. Admin-only aggregates
 * (revenue, top clients) are gated.
 */
export async function getRichDashboard(ctx: Ctx) {
  const isAdmin = ctx.role === "ADMIN";
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86_400_000);

  const orderScope = isAdmin ? {} : { team: { some: { userId: ctx.userId } } };
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 6, 1); // 7-month revenue window

  const [
    activeProjects,
    completedProjects,
    proposalsInPlay,
    clients,
    openTickets,
    amcActive,
    activeOrders, // ACTIVE only, milestone status/dueDate for health (was: every order + nested)
    recentOrders, // 4 most recent, for recentProjects
    topOrders, // top 4 by value, for topClients (admin)
    receiptAgg, // Σ receipts (admin) — was a full ledger scan
    recentReceipts, // last 7 months only, for the revenue series (admin)
    dueFollowUps,
    dueVisits,
    audits,
    milestonesDue,
    slaTickets,
  ] = await Promise.all([
    prisma.order.count({ where: { companyId: ctx.companyId, status: "ACTIVE", ...orderScope } }),
    prisma.order.count({ where: { companyId: ctx.companyId, status: "COMPLETED", ...orderScope } }),
    prisma.proposal.count({ where: { companyId: ctx.companyId, status: { in: ["DRAFT", "SENT", "UNDER_NEGOTIATION"] } } }),
    prisma.lead.count({ where: { companyId: ctx.companyId, deletedAt: null, proposal: { isNot: null } } }),
    prisma.serviceTicket.count({ where: { companyId: ctx.companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.serviceContract.count({ where: { companyId: ctx.companyId, status: "ACTIVE" } }),
    prisma.order.findMany({
      where: { companyId: ctx.companyId, status: "ACTIVE", ...orderScope },
      select: { milestones: { select: { status: true, dueDate: true } } },
    }),
    prisma.order.findMany({
      where: { companyId: ctx.companyId, ...orderScope },
      select: { id: true, clientName: true, status: true, stages: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    isAdmin
      ? prisma.order.findMany({
          where: { companyId: ctx.companyId, ...orderScope },
          select: { clientName: true, projectValue: true },
          orderBy: { projectValue: "desc" },
          take: 4,
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.receipt.aggregate({ where: { milestone: { order: { companyId: ctx.companyId } } }, _sum: { amount: true } })
      : Promise.resolve(null),
    isAdmin
      ? prisma.receipt.findMany({ where: { milestone: { order: { companyId: ctx.companyId } }, date: { gte: seriesStart } }, select: { date: true, amount: true } })
      : Promise.resolve([]),
    prisma.followUp.findMany({
      where: { nextDate: { gte: now, lte: in14 }, lead: { companyId: ctx.companyId } },
      include: { lead: { select: { customerName: true } } },
      orderBy: { nextDate: "asc" },
      take: 4,
    }),
    prisma.maintenanceVisit.findMany({
      where: { contract: { companyId: ctx.companyId }, status: { in: ["UPCOMING", "DUE"] }, scheduledDate: { lte: in14 } },
      include: { contract: { select: { clientName: true, contractNo: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 3,
    }),
    prisma.auditLog.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.paymentMilestone.findMany({
      where: { order: { companyId: ctx.companyId }, status: { in: ["DUE", "PARTIALLY_PAID"] }, dueDate: { lt: now } },
      include: { order: { select: { clientName: true, orderNo: true } } },
      orderBy: { dueDate: "asc" },
      take: 1,
    }),
    prisma.serviceTicket.findMany({
      where: { companyId: ctx.companyId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: "CRITICAL" },
      take: 1,
    }),
  ]);

  // ----- Hero stats -----
  const totalReceived = new Decimal(receiptAgg?._sum.amount ?? 0);

  // ----- Project overview (phase breakdown) -----
  const projectOverview = [
    { label: "Proposals", value: proposalsInPlay, color: "#2563eb" },
    { label: "Construction", value: activeProjects, color: "#10b981" },
    { label: "Operation (AMC)", value: amcActive, color: "#7c3aed" },
    { label: "Completed", value: completedProjects, color: "#f59e0b" },
  ];
  const projectTotal = projectOverview.reduce((a, p) => a + p.value, 0);

  // ----- Site / project health -----
  let healthy = 0,
    warning = 0,
    critical = 0;
  for (const o of activeOrders) {
    const overdue = o.milestones.some((m) => m.status !== "PAID" && m.dueDate && m.dueDate < now);
    const anyDue = o.milestones.some((m) => m.status === "DUE");
    if (overdue) critical++;
    else if (anyDue) warning++;
    else healthy++;
  }
  const health = { healthy, warning, critical, total: activeProjects };

  // ----- Recent projects with progress -----
  const recentProjects = recentOrders.map((o) => {
    const done = o.stages.filter((s) => s.status === "DONE").length;
    const progress = o.stages.length ? Math.round((done / o.stages.length) * 100) : 0;
    const phase = progress === 0 ? "Kickoff" : progress < 40 ? "Civil Works" : progress < 80 ? "Installation" : progress < 100 ? "Commissioning" : "Handover";
    return { id: o.id, name: o.clientName, phase, progress };
  });

  // ----- Revenue series (last 7 months of collections) -----
  const revenueSeries = buildMonthlySeries(recentReceipts, now, 7);

  // ----- Upcoming tasks (follow-ups + PM visits) -----
  const tasks = [
    ...dueFollowUps.map((f) => ({
      date: f.nextDate!,
      title: "Follow-up",
      subtitle: f.lead?.customerName ?? "Lead",
      priority: "High" as const,
    })),
    ...dueVisits.map((v) => ({
      date: v.scheduledDate,
      title: "Maintenance visit",
      subtitle: v.contract.clientName,
      priority: "Medium" as const,
    })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map((t) => ({ ...t, date: t.date.toISOString() }));

  // ----- Recent activity (audit log) -----
  const activity = audits.map((a) => ({
    action: a.action,
    entity: a.entity,
    at: a.createdAt.toISOString(),
  }));

  // ----- Environmental impact (derived from won plant capacity) -----
  const wonCapacity = await prisma.proposal.aggregate({
    where: { companyId: ctx.companyId, status: "WON" },
    _sum: { capacityKLD: true },
  });
  const kld = wonCapacity._sum.capacityKLD ?? 0;
  const env = {
    gallonsTreatedM: Math.round(((kld * 264.172 * 365) / 1_000_000) * 10) / 10, // KLD→gallons/yr, in millions
    efficiencyPct: 92,
    pollutantsTons: Math.round(kld * 0.35),
    peopleServed: Math.round(kld * 6.7), // ~150 lpcd
  };

  // ----- Critical alert -----
  let alert: { title: string; detail: string; href: string } | null = null;
  if (slaTickets[0]) {
    alert = { title: "Critical service ticket", detail: `${slaTickets[0].ticketNo}: ${slaTickets[0].title}`, href: "/service" };
  } else if (isAdmin && milestonesDue[0]) {
    alert = {
      title: "Overdue payment",
      detail: `${milestonesDue[0].order.clientName} — ${milestonesDue[0].order.orderNo}`,
      href: "/reports",
    };
  }

  const base = {
    isAdmin,
    hero: {
      activeProjects,
      totalClients: clients,
      openServiceRequests: openTickets,
    },
    projectOverview,
    projectTotal,
    health,
    recentProjects,
    tasks,
    activity,
    env,
    alert,
  };
  if (!isAdmin) return { ...base, revenue: null, revenueSeries: [], topClients: [] };

  const topClients = topOrders.map((o) => ({ name: o.clientName, value: o.projectValue.toString() }));

  return {
    ...base,
    revenue: totalReceived.toFixed(2),
    revenueSeries,
    topClients,
  };
}

function buildMonthlySeries(receipts: { date: Date; amount: Decimal }[], now: Date, months: number) {
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-IN", { month: "short" }), value: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of receipts) {
    const k = `${r.date.getFullYear()}-${r.date.getMonth()}`;
    const i = idx.get(k);
    if (i != null) buckets[i].value += Number(r.amount);
  }
  return buckets.map((b) => ({ label: b.label, value: Math.round(b.value) }));
}
