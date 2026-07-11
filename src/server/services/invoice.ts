import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { computeGst, WORKS_CONTRACT_SAC } from "@/lib/gst";
import { amountInWords } from "@/lib/money";
import { allocateNumber } from "./numbering";

/**
 * Create a GST invoice from a milestone (spec §7.3). One tap → sequential
 * GEC-INV-YEAR-### (never reused), GST split by place-of-supply, amount-in-words,
 * pdfUrl points at the branded print route. Admin only.
 */
export async function createInvoiceFromMilestone(
  ctx: Ctx,
  milestoneId: string,
  opts?: { placeOfSupplyStateCode?: string; date?: Date; gstRate?: number },
) {
  requireAdmin(ctx);
  const milestone = await prisma.paymentMilestone.findFirst({
    where: { id: milestoneId, order: { companyId: ctx.companyId } }, // tenant-scoped
    include: { order: true, invoice: true }, // invoice eager-loaded → dedup guard below
  });
  if (!milestone) throw new Error("Milestone not found");
  if (milestone.invoice) return { invoiceId: milestone.invoice.id, already: true };

  // Place-of-supply = the customer's state → real IGST for inter-state supply.
  // Priority: explicit override → order.clientStateCode → state code derived from the
  // client GSTIN (its first 2 digits) → the company state (intra-state) as last resort.
  const gstinState =
    milestone.order.clientGstin && /^\d{2}/.test(milestone.order.clientGstin)
      ? milestone.order.clientGstin.slice(0, 2)
      : undefined;
  const pos = opts?.placeOfSupplyStateCode ?? milestone.order.clientStateCode ?? gstinState ?? env.companyStateCode;
  const gst = computeGst({
    taxableAmount: milestone.amount,
    supplierStateCode: env.companyStateCode,
    placeOfSupplyStateCode: pos,
    rate: opts?.gstRate ?? 18,
  });

  const year = (opts?.date ?? new Date()).getFullYear();
  const lineItems = [
    {
      description: `${milestone.description} — ${milestone.order.clientName}`,
      sac: WORKS_CONTRACT_SAC,
      amount: gst.taxable,
    },
  ];

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await allocateNumber(tx, ctx.companyId, "INVOICE", year);
    const invoice = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        invoiceNo,
        orderId: milestone.orderId,
        milestoneId,
        date: opts?.date ?? new Date(),
        lineItems: lineItems as Prisma.InputJsonValue,
        taxType: gst.taxType,
        gstBreakup: {
          cgst: gst.cgst,
          sgst: gst.sgst,
          igst: gst.igst,
          rate: gst.rate,
        } as Prisma.InputJsonValue,
        total: gst.total,
        amountWords: amountInWords(gst.total),
        pdfUrl: `/print/invoice/${invoiceNo}`,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "Invoice", entityId: invoice.id, after: { invoiceNo } }, tx);
    return { invoiceId: invoice.id, invoiceNo, already: false };
  });
}

export async function getInvoice(ctx: Ctx, invoiceNo: string) {
  requireAdmin(ctx);
  return prisma.invoice.findFirst({
    where: { invoiceNo, companyId: ctx.companyId },
    include: { milestone: { include: { order: true } } },
  });
}

export interface InvoiceFilters {
  search?: string;
  cursor?: string;
  take?: number;
}

/** Invoice list with cursor pagination + search (before this it was cap-200, cursorless). */
export async function listInvoices(ctx: Ctx, filters: InvoiceFilters = {}) {
  requireAdmin(ctx);
  const take = Math.min(filters.take ?? 50, 100);
  const where: Prisma.InvoiceWhereInput = {
    companyId: ctx.companyId,
    ...(filters.search
      ? { OR: [{ invoiceNo: { contains: filters.search, mode: "insensitive" } }] }
      : {}),
  };
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export interface InvoiceStats {
  count: number;
  creditNotes: number;
  invoicedTotal: number; // Σ total (net of credit notes) — sell-side, all admin here
  outstanding: number; // Σ (milestone.amount − receipts) for invoiced-and-unpaid milestones
}

/** Header KPIs. Whole module is admin-only, so all money is visible here. */
export async function invoiceStats(ctx: Ctx): Promise<InvoiceStats> {
  requireAdmin(ctx);
  const invoices = await prisma.invoice.findMany({
    where: { companyId: ctx.companyId },
    select: { total: true, isCreditNote: true, milestone: { select: { amount: true, status: true, receipts: { select: { amount: true } } } } },
  });
  let invoicedTotal = new Decimal(0);
  let outstanding = new Decimal(0);
  let creditNotes = 0;
  for (const inv of invoices) {
    invoicedTotal = invoicedTotal.plus(new Decimal(inv.total));
    if (inv.isCreditNote) creditNotes += 1;
    const m = inv.milestone;
    if (m && !inv.isCreditNote && m.status !== "PAID") {
      const paid = m.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
      const bal = new Decimal(m.amount).minus(paid);
      if (bal.gt(0)) outstanding = outstanding.plus(bal);
    }
  }
  return {
    count: invoices.length,
    creditNotes,
    invoicedTotal: Math.round(invoicedTotal.toNumber()),
    outstanding: Math.round(outstanding.toNumber()),
  };
}

/**
 * Credit note = a fully-negated reversal of the original (spec §7.3). Every money
 * field is negated so the note reconciles (taxable + cgst+sgst+igst == total, all ≤ 0)
 * — the future GSTR-filing report nets correctly off this. Guards: tenant-scoped, can't
 * credit a credit note, and can't over-reverse (one CN per invoice). Audited.
 */
export async function createCreditNote(ctx: Ctx, originalInvoiceId: string, reason: string) {
  requireAdmin(ctx);
  const orig = await prisma.invoice.findFirst({ where: { id: originalInvoiceId, companyId: ctx.companyId } });
  if (!orig) throw new Error("Invoice not found");
  if (orig.isCreditNote) throw new Error("Cannot raise a credit note against a credit note");

  const gb = (orig.gstBreakup ?? {}) as { cgst?: string; sgst?: string; igst?: string; rate?: number };
  const origLine = ((orig.lineItems as Array<{ amount?: string }>) ?? [])[0];
  const negTaxable = new Decimal(origLine?.amount ?? 0).negated(); // taxable-exclusive (matches a normal invoice line)
  const total = new Decimal(orig.total).negated();
  const year = new Date().getFullYear();

  return prisma.$transaction(async (tx) => {
    // Over-reversal guard — at most one credit note per original invoice.
    const existing = await tx.invoice.findFirst({ where: { creditNoteOfId: orig.id } });
    if (existing) throw new Error(`Invoice ${orig.invoiceNo} is already credited (${existing.invoiceNo})`);

    const invoiceNo = await allocateNumber(tx, ctx.companyId, "INVOICE", year);
    const cn = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        invoiceNo,
        orderId: orig.orderId,
        // NOT milestoneId — that's @unique 1:1 and belongs to the original invoice.
        creditNoteOfId: orig.id,
        date: new Date(),
        lineItems: [{ description: `Credit note vs ${orig.invoiceNo}: ${reason}`, sac: WORKS_CONTRACT_SAC, amount: negTaxable.toFixed(2) }] as Prisma.InputJsonValue,
        taxType: orig.taxType,
        gstBreakup: {
          cgst: new Decimal(gb.cgst ?? 0).negated().toFixed(2),
          sgst: new Decimal(gb.sgst ?? 0).negated().toFixed(2),
          igst: new Decimal(gb.igst ?? 0).negated().toFixed(2),
          rate: gb.rate ?? 18,
        } as Prisma.InputJsonValue,
        total: total.toFixed(2),
        amountWords: amountInWords(total.abs()) + " (Credit)",
        pdfUrl: `/print/invoice/${invoiceNo}`,
        isCreditNote: true,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "Invoice", entityId: cn.id, after: { invoiceNo, creditNoteOf: orig.invoiceNo, total: total.toFixed(2) } }, tx);
    return { invoiceId: cn.id, invoiceNo };
  });
}
