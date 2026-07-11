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

export function computeGst(input: GstInput): GstBreakup {
  const rate = input.rate ?? DEFAULT_GST_RATE;
  const taxable = round2(input.taxableAmount);
  const taxType = taxTypeFor(input.supplierStateCode, input.placeOfSupplyStateCode);

  const gstAmount = round2(taxable.times(rate).div(100));

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

  const total = round2(taxable.plus(gstAmount));

  return {
    taxType,
    rate,
    taxable: taxable.toFixed(2),
    cgst: cgst.toFixed(2),
    sgst: sgst.toFixed(2),
    igst: igst.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    total: total.toFixed(2),
  };
}
