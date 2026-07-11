import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { daysOverdue } from "@/lib/domain/milestone";

/** Receivables report (spec §7.3) — admin only. All projects × unpaid milestones. */
export async function getReceivables(ctx: Ctx) {
  requireAdmin(ctx);
  const milestones = await prisma.paymentMilestone.findMany({
    where: {
      order: { companyId: ctx.companyId },
      status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID"] },
    },
    include: { order: { select: { orderNo: true, clientName: true } }, receipts: true },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const rows = milestones.map((m) => {
    const paid = m.receipts.reduce<Decimal>((a, r) => a.plus(r.amount), new Decimal(0));
    const balance = new Decimal(m.amount).minus(paid);
    return {
      orderNo: m.order.orderNo,
      client: m.order.clientName,
      description: m.description,
      amount: m.amount.toString(),
      received: paid.toFixed(2),
      balance: balance.toFixed(2),
      dueDate: m.dueDate?.toISOString() ?? null,
      daysOverdue: daysOverdue(m.dueDate, now),
      status: m.status,
    };
  });

  const totalOutstanding = rows.reduce<Decimal>((a, r) => a.plus(r.balance), new Decimal(0));
  const totalOverdue = rows
    .filter((r) => r.daysOverdue > 0)
    .reduce<Decimal>((a, r) => a.plus(r.balance), new Decimal(0));

  return { rows, totalOutstanding: totalOutstanding.toFixed(2), totalOverdue: totalOverdue.toFixed(2) };
}

/**
 * GST summary for filing (GSTR) — admin only. Nets credit notes (their GST is
 * negated at source), grouped by rate. taxable = total − (cgst+sgst+igst). This is
 * why the credit-note negation fix mattered: a positive CN GST would inflate the filing.
 */
export async function getGstSummary(ctx: Ctx, range?: { from?: Date; to?: Date }) {
  requireAdmin(ctx);
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId: ctx.companyId,
      ...(range?.from || range?.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}),
    },
    select: { gstBreakup: true, total: true, taxType: true },
  });
  const byRate = new Map<number, { rate: number; taxable: Decimal; cgst: Decimal; sgst: Decimal; igst: Decimal; total: Decimal; count: number }>();
  for (const inv of invoices) {
    const gb = (inv.gstBreakup ?? {}) as { cgst?: string; sgst?: string; igst?: string; rate?: number };
    const rate = gb.rate ?? 18;
    const cgst = new Decimal(gb.cgst ?? 0);
    const sgst = new Decimal(gb.sgst ?? 0);
    const igst = new Decimal(gb.igst ?? 0);
    const total = new Decimal(inv.total);
    const taxable = total.minus(cgst).minus(sgst).minus(igst);
    const g = byRate.get(rate) ?? { rate, taxable: new Decimal(0), cgst: new Decimal(0), sgst: new Decimal(0), igst: new Decimal(0), total: new Decimal(0), count: 0 };
    g.taxable = g.taxable.plus(taxable);
    g.cgst = g.cgst.plus(cgst);
    g.sgst = g.sgst.plus(sgst);
    g.igst = g.igst.plus(igst);
    g.total = g.total.plus(total);
    g.count += 1;
    byRate.set(rate, g);
  }
  const groups = [...byRate.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((g) => ({ rate: g.rate, count: g.count, taxable: g.taxable.toFixed(2), cgst: g.cgst.toFixed(2), sgst: g.sgst.toFixed(2), igst: g.igst.toFixed(2), total: g.total.toFixed(2) }));
  const grand = groups.reduce(
    (a, g) => ({
      taxable: a.taxable.plus(g.taxable),
      cgst: a.cgst.plus(g.cgst),
      sgst: a.sgst.plus(g.sgst),
      igst: a.igst.plus(g.igst),
      total: a.total.plus(g.total),
    }),
    { taxable: new Decimal(0), cgst: new Decimal(0), sgst: new Decimal(0), igst: new Decimal(0), total: new Decimal(0) },
  );
  return {
    groups,
    grand: { taxable: grand.taxable.toFixed(2), cgst: grand.cgst.toFixed(2), sgst: grand.sgst.toFixed(2), igst: grand.igst.toFixed(2), total: grand.total.toFixed(2) },
    invoiceCount: invoices.length,
  };
}

/** Collection summary — invoiced (net of credit notes) vs collected vs outstanding. Admin. */
export async function getCollectionSummary(ctx: Ctx) {
  requireAdmin(ctx);
  const [invoiceAgg, receiptAgg, recv] = await Promise.all([
    prisma.invoice.aggregate({ where: { companyId: ctx.companyId }, _sum: { total: true } }),
    prisma.receipt.aggregate({ where: { milestone: { order: { companyId: ctx.companyId } } }, _sum: { amount: true } }),
    getReceivables(ctx),
  ]);
  return {
    invoicedNet: new Decimal(invoiceAgg._sum.total ?? 0).toFixed(2),
    collected: new Decimal(receiptAgg._sum.amount ?? 0).toFixed(2),
    outstanding: recv.totalOutstanding, // canonical receivables (all non-PAID) — shared with projectAnalytics/orderStats
    overdue: recv.totalOverdue,
  };
}

/** Reference analytics (spec §7 cross-cutting) — which references drive business. */
export async function getReferenceAnalytics(ctx: Ctx) {
  requireAdmin(ctx);
  const refs = await prisma.reference.findMany({
    where: { companyId: ctx.companyId },
    include: {
      leads: {
        select: {
          status: true,
          proposal: { select: { status: true, order: { select: { projectValue: true } } } },
        },
      },
    },
  });
  return refs
    .map((r) => {
      const leads = r.leads.length;
      const won = r.leads.filter((l) => l.proposal?.order).length;
      const value = r.leads.reduce<Decimal>(
        (a, l) => a.plus(l.proposal?.order?.projectValue ?? 0),
        new Decimal(0),
      );
      return { id: r.id, name: r.name, leads, won, value: value.toFixed(2) };
    })
    .filter((r) => r.leads > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
}
