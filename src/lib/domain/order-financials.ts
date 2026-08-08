import { Decimal } from "decimal.js";

/**
 * Per-project financial summary for the client Financial view (proposal doc's
 * "Advance Received / Invoice Raised / Payment Received"). Pure + unit-tested.
 *
 * "Advance Received" is the receipts against the FIRST milestone (seq 1) — the
 * schema has no separate "advance" concept, so this follows the same convention
 * DEFAULT_PAYMENT_TERMS[0] already establishes ("Advance on order confirmation").
 * "Invoice Raised" only counts ISSUED invoices (DRAFT auto-drafts are excluded
 * from every money aggregate until issued, per the documented Invoice.status
 * rule) and nets credit notes naturally — a credit note's `total` is already
 * stored negative, so summing every ISSUED invoice row for the order (original
 * + credit note) nets it without special-casing.
 */
export interface MilestoneReceipts {
  seq: number;
  receiptAmounts: Decimal.Value[];
}

export interface InvoiceRow {
  status: string;
  total: Decimal.Value;
}

export interface OrderFinancials {
  advanceReceived: string;
  invoiceRaised: string;
  paymentReceived: string;
}

export function computeOrderFinancials(
  milestones: MilestoneReceipts[],
  invoices: InvoiceRow[],
): OrderFinancials {
  let advance = new Decimal(0);
  let payments = new Decimal(0);
  for (const m of milestones) {
    const sum = m.receiptAmounts.reduce<Decimal>((a, r) => a.plus(r), new Decimal(0));
    payments = payments.plus(sum);
    if (m.seq === 1) advance = advance.plus(sum);
  }
  const invoiceRaised = invoices
    .filter((i) => i.status === "ISSUED")
    .reduce<Decimal>((a, i) => a.plus(i.total), new Decimal(0));

  return {
    advanceReceived: advance.toFixed(2),
    invoiceRaised: invoiceRaised.toFixed(2),
    paymentReceived: payments.toFixed(2),
  };
}
