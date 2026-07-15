import { Decimal } from "decimal.js";
import { round2 } from "./money";

/**
 * GST computation (spec §7.3). Place-of-supply logic:
 *   supplier state == place-of-supply state  -> intra-state: CGST + SGST (rate split in half)
 *   otherwise                                 -> inter-state: IGST (full rate)
 *
 * Works-contract SAC default: 9954 @ 18% (confirm with auditor — spec §11).
 * State codes are the 2-digit GSTIN state prefix (e.g. Tamil Nadu = 33).
 */

export type TaxType = "CGST_SGST" | "IGST";

export const WORKS_CONTRACT_SAC = "9954";
export const DEFAULT_GST_RATE = 18;

export interface GstBreakup {
  taxType: TaxType;
  rate: number; // total GST %
  taxable: string; // decimal string
  cgst: string;
  sgst: string;
  igst: string;
  gstAmount: string;
  total: string; // taxable + gst
}

export interface GstInput {
  taxableAmount: Decimal.Value;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  rate?: number; // total GST %, default 18
}

/** Derive whether a supply is intra-state given the two state codes. */
export function taxTypeFor(supplierStateCode: string, placeOfSupplyStateCode: string): TaxType {
  const a = String(supplierStateCode).trim();
  const b = String(placeOfSupplyStateCode).trim();
  return a && b && a === b ? "CGST_SGST" : "IGST";
}

/** Split a GST amount into CGST/SGST or IGST and assemble the breakup. Shared by the
 *  exclusive and inclusive computations so the two can never drift apart. */
function buildBreakup(taxable: Decimal, gstAmount: Decimal, taxType: TaxType, rate: number): GstBreakup {
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);

  if (taxType === "CGST_SGST") {
    // Split so cgst + sgst === gstAmount exactly (avoid rounding drift).
    cgst = round2(gstAmount.div(2));
    sgst = gstAmount.minus(cgst);
  } else {
    igst = gstAmount;
  }

  return {
    taxType,
    rate,
    taxable: taxable.toFixed(2),
    cgst: cgst.toFixed(2),
    sgst: sgst.toFixed(2),
    igst: igst.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    total: round2(taxable.plus(gstAmount)).toFixed(2),
  };
}

/** GST on a tax-EXCLUSIVE base: total = base + GST. */
export function computeGst(input: GstInput): GstBreakup {
  const rate = input.rate ?? DEFAULT_GST_RATE;
  const taxable = round2(input.taxableAmount);
  const taxType = taxTypeFor(input.supplierStateCode, input.placeOfSupplyStateCode);
  const gstAmount = round2(taxable.times(rate).div(100));
  return buildBreakup(taxable, gstAmount, taxType, rate);
}

export interface GstInclusiveInput {
  grossAmount: Decimal.Value; // a tax-INCLUSIVE amount (the customer's total payable)
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  rate?: number;
}

/**
 * GST backed OUT of a tax-INCLUSIVE gross, so `taxable + gstAmount === gross` EXACTLY
 * and `total === gross`. Use this when the amount already includes GST — e.g. a payment
 * milestone whose `amount` is a % of the proposal grand total (which is subtotal + GST).
 * Charging `computeGst` on that gross would tax GST twice; this decomposes it instead.
 * The exact reconciliation matters: the invoice total must equal the milestone receivable,
 * or a full payment never zeroes the milestone (it lingers ±1 paisa forever).
 */
export function computeGstInclusive(input: GstInclusiveInput): GstBreakup {
  const rate = input.rate ?? DEFAULT_GST_RATE;
  const gross = round2(input.grossAmount);
  const taxType = taxTypeFor(input.supplierStateCode, input.placeOfSupplyStateCode);
  const divisor = new Decimal(1).plus(new Decimal(rate).div(100));
  const taxable = round2(gross.div(divisor));
  const gstAmount = gross.minus(taxable); // exact by construction → total === gross
  return buildBreakup(taxable, gstAmount, taxType, rate);
}
