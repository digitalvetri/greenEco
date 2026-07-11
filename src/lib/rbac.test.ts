import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { stripPricing, stripPurchaseOrderPricing, can } from "./rbac";

describe("stripPricing — EMPLOYEE never sees cost/margin/budget", () => {
  it("removes admin-only keys from a flat object (serialized JSON check)", () => {
    const item = {
      id: "i1",
      name: "Blower 2HP",
      unit: "nos",
      reorderLevel: new Decimal(2),
      purchasePrice: new Decimal(412),
    };
    const stripped = stripPricing(item, "EMPLOYEE");
    const json = JSON.stringify(stripped);
    expect(json).not.toContain("purchasePrice");
    expect(json).not.toContain("412");
    expect(stripped.name).toBe("Blower 2HP");
  });

  it("removes admin-only keys from nested objects and arrays", () => {
    const project = {
      orderNo: "GEC-ORD-2026-001",
      projectValue: new Decimal(1500000),
      budget: { baseAmount: new Decimal(1200000), adjustments: [{ amount: 5000 }] },
      version: {
        grandTotal: new Decimal(1500000),
        estimatedCost: new Decimal(1200000),
        boqItems: [
          { item: "MBBR Media", rate: new Decimal(90), valueAtCost: new Decimal(60) },
        ],
      },
    };
    const stripped = stripPricing(project, "EMPLOYEE") as typeof project;
    const json = JSON.stringify(stripped);
    for (const key of ["estimatedCost", "valueAtCost", "budget", "baseAmount", "adjustments"]) {
      expect(json).not.toContain(key);
    }
    // Sell-side values employees ARE allowed to see remain.
    expect(json).toContain("projectValue");
    expect(json).toContain("grandTotal");
    // BOQ sell rate is preserved (not a purchase price).
    expect(json).toContain('"rate"');
  });

  it("leaves ADMIN payloads untouched (identity)", () => {
    const item = { purchasePrice: new Decimal(412), estimatedCost: new Decimal(1200000) };
    const out = stripPricing(item, "ADMIN");
    expect(out).toBe(item);
    expect(JSON.stringify(out)).toContain("purchasePrice");
  });

  it("does not mutate the input for EMPLOYEE", () => {
    const item = { purchasePrice: new Decimal(412), name: "x" };
    stripPricing(item, "EMPLOYEE");
    expect(item.purchasePrice.toString()).toBe("412");
  });

  it("strips PO line rates + totalValue for EMPLOYEE via stripPurchaseOrderPricing", () => {
    const po = {
      poNo: "GEC-PO-2026-001",
      totalValue: new Decimal(50000),
      items: [{ itemId: "i1", qty: 10, rate: new Decimal(400) }],
    };
    const stripped = stripPurchaseOrderPricing(po, "EMPLOYEE");
    const json = JSON.stringify(stripped);
    expect(json).not.toContain("totalValue");
    expect(json).not.toContain("rate");
    expect(json).not.toContain("400");
    expect(json).toContain("qty");
  });
});

describe("Phase 3 materials/erection payloads — EMPLOYEE stripping", () => {
  it("item list: purchasePrice absent, stock balances retained", () => {
    const items = [
      {
        id: "i1",
        name: "Air Blower 2HP",
        unit: "nos",
        purchasePrice: new Decimal(34000),
        total: "5",
        byLocation: [{ location: "Main Warehouse", qty: "5" }],
        lowStock: false,
      },
    ];
    const json = JSON.stringify(stripPricing(items, "EMPLOYEE"));
    expect(json).not.toContain("purchasePrice");
    expect(json).not.toContain("34000");
    expect(json).toContain("byLocation");
    expect(json).toContain("Main Warehouse");
  });

  it("stock movement: valueAtCost absent for EMPLOYEE", () => {
    const mv = { itemId: "i1", qty: "10", type: "CONSUME", valueAtCost: new Decimal(3400), note: "issued" };
    const json = JSON.stringify(stripPricing(mv, "EMPLOYEE"));
    expect(json).not.toContain("valueAtCost");
    expect(json).not.toContain("3400");
    expect(json).toContain("qty");
  });

  it("budget-vs-actual object is dropped wholesale for EMPLOYEE via `budget` key", () => {
    const order = { orderNo: "GEC-ORD-2026-001", budget: { baseAmount: new Decimal(1200000) } };
    const json = JSON.stringify(stripPricing(order, "EMPLOYEE"));
    expect(json).not.toContain("baseAmount");
    expect(json).not.toContain("1200000");
    expect(json).toContain("GEC-ORD-2026-001");
  });
});

describe("capability flags", () => {
  it("ADMIN can do privileged actions, EMPLOYEE cannot", () => {
    const admin = can("ADMIN");
    const emp = can("EMPLOYEE");
    expect(admin.seePricing).toBe(true);
    expect(admin.approveErection).toBe(true);
    expect(emp.seePricing).toBe(false);
    expect(emp.managePO).toBe(false);
    expect(emp.seeBudget).toBe(false);
  });
});
