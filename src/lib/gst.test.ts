import { describe, it, expect } from "vitest";
import { computeGst, computeGstInclusive, taxTypeFor } from "./gst";

describe("GST place-of-supply", () => {
  it("intra-state (same state) -> CGST + SGST split", () => {
    const r = computeGst({
      taxableAmount: 100000,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    expect(r.taxType).toBe("CGST_SGST");
    expect(r.cgst).toBe("9000.00");
    expect(r.sgst).toBe("9000.00");
    expect(r.igst).toBe("0.00");
    expect(r.gstAmount).toBe("18000.00");
    expect(r.total).toBe("118000.00");
  });

  it("inter-state (different state) -> IGST full", () => {
    const r = computeGst({
      taxableAmount: 100000,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "29",
    });
    expect(r.taxType).toBe("IGST");
    expect(r.igst).toBe("18000.00");
    expect(r.cgst).toBe("0.00");
    expect(r.total).toBe("118000.00");
  });

  it("cgst + sgst always equals gstAmount exactly (no rounding drift)", () => {
    const r = computeGst({
      taxableAmount: 12345.67,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
      rate: 18,
    });
    const sum = (Number(r.cgst) + Number(r.sgst)).toFixed(2);
    expect(sum).toBe(r.gstAmount);
  });

  it("taxTypeFor is robust to whitespace", () => {
    expect(taxTypeFor(" 33 ", "33")).toBe("CGST_SGST");
    expect(taxTypeFor("33", "27")).toBe("IGST");
  });
});

describe("GST inclusive (milestone invoices — no double taxation)", () => {
  it("backs GST out of a GST-inclusive gross; total === gross exactly", () => {
    // Real regression: a 30% milestone of a proposal whose grandTotal already includes GST.
    // gross 724593.75 (= 30% of 2415312.50) must decompose to taxable 614062.50 + GST 110531.25,
    // NOT be treated as a 724593.75 taxable base with GST added on top (which billed 855020.63).
    const r = computeGstInclusive({
      grossAmount: 724593.75,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
      rate: 18,
    });
    expect(r.taxable).toBe("614062.50");
    expect(r.gstAmount).toBe("110531.25");
    expect(r.total).toBe("724593.75"); // == gross
    expect((Number(r.cgst) + Number(r.sgst)).toFixed(2)).toBe(r.gstAmount);
  });

  it("taxable + gstAmount === gross for awkward amounts (no ±1 paisa drift)", () => {
    for (const gross of [100, 999.99, 123456.78, 1, 33333.33]) {
      const r = computeGstInclusive({ grossAmount: gross, supplierStateCode: "33", placeOfSupplyStateCode: "29", rate: 18 });
      expect(Number(r.total)).toBe(gross); // total must equal the receivable exactly
      expect((Number(r.taxable) + Number(r.gstAmount)).toFixed(2)).toBe(gross.toFixed(2));
    }
  });

  it("inclusive is the inverse of exclusive at the round figure", () => {
    const excl = computeGst({ taxableAmount: 100000, supplierStateCode: "33", placeOfSupplyStateCode: "33" });
    const incl = computeGstInclusive({ grossAmount: 118000, supplierStateCode: "33", placeOfSupplyStateCode: "33" });
    expect(incl.taxable).toBe(excl.taxable); // 100000.00
    expect(incl.gstAmount).toBe(excl.gstAmount); // 18000.00
  });
});
