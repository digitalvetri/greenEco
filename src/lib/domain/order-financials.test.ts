import { describe, it, expect } from "vitest";
import { computeOrderFinancials } from "./order-financials";

describe("computeOrderFinancials", () => {
  it("sums receipts across all milestones for Payment Received", () => {
    const r = computeOrderFinancials(
      [
        { seq: 1, receiptAmounts: ["50000"] },
        { seq: 2, receiptAmounts: ["30000", "10000"] },
      ],
      [],
    );
    expect(r.paymentReceived).toBe("90000.00");
  });

  it("Advance Received is only the seq-1 milestone's receipts", () => {
    const r = computeOrderFinancials(
      [
        { seq: 1, receiptAmounts: ["50000"] },
        { seq: 2, receiptAmounts: ["30000"] },
      ],
      [],
    );
    expect(r.advanceReceived).toBe("50000.00");
  });

  it("a project with no seq-1 milestone has zero advance but still counts payments", () => {
    const r = computeOrderFinancials([{ seq: 2, receiptAmounts: ["30000"] }], []);
    expect(r.advanceReceived).toBe("0.00");
    expect(r.paymentReceived).toBe("30000.00");
  });

  it("Invoice Raised excludes DRAFT invoices", () => {
    const r = computeOrderFinancials(
      [],
      [
        { status: "ISSUED", total: "100000" },
        { status: "DRAFT", total: "50000" },
      ],
    );
    expect(r.invoiceRaised).toBe("100000.00");
  });

  it("Invoice Raised nets a credit note (stored as a negative-total ISSUED invoice)", () => {
    const r = computeOrderFinancials(
      [],
      [
        { status: "ISSUED", total: "100000" },
        { status: "ISSUED", total: "-100000" }, // credit note reversing the invoice above
      ],
    );
    expect(r.invoiceRaised).toBe("0.00");
  });

  it("everything is zero for a project with no milestones/invoices yet", () => {
    const r = computeOrderFinancials([], []);
    expect(r).toEqual({ advanceReceived: "0.00", invoiceRaised: "0.00", paymentReceived: "0.00" });
  });
});
