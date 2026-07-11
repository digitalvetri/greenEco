import { describe, it, expect } from "vitest";
import { computeGst, taxTypeFor } from "./gst";

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
