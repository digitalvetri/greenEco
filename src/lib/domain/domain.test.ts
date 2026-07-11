import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { deriveItemBalances, deriveBalances, belowReorder, type MovementLike } from "./stock";
import { computeMilestoneStatus, daysOverdue } from "./milestone";
import { formatDocNumber, parseDocNumber } from "./numbering";

describe("stock balance derivation (immutable ledger)", () => {
  const wh = "loc-warehouse";
  const site = "loc-site";

  it("derives per-location and total balances across movement types", () => {
    const movements: MovementLike[] = [
      { itemId: "i1", qty: 100, type: "GRN", toLocationId: wh },
      { itemId: "i1", qty: 30, type: "TRANSFER_OUT", fromLocationId: wh },
      { itemId: "i1", qty: 30, type: "TRANSFER_IN", toLocationId: site },
      { itemId: "i1", qty: 10, type: "CONSUME", fromLocationId: site },
    ];
    const { total, byLocation } = deriveItemBalances(movements);
    expect(byLocation.get(wh)!.toNumber()).toBe(70);
    expect(byLocation.get(site)!.toNumber()).toBe(20);
    expect(total.toNumber()).toBe(90);
  });

  it("ADJUST can add or remove", () => {
    const movements: MovementLike[] = [
      { itemId: "i1", qty: 5, type: "GRN", toLocationId: wh },
      { itemId: "i1", qty: 2, type: "ADJUST", fromLocationId: wh }, // variance short
    ];
    expect(deriveItemBalances(movements).total.toNumber()).toBe(3);
  });

  it("flags items below reorder level", () => {
    const movements: MovementLike[] = [
      { itemId: "blower", qty: 1, type: "GRN", toLocationId: wh },
    ];
    const balances = deriveBalances(movements);
    const low = belowReorder(balances, new Map([["blower", new Decimal(2)]]));
    expect(low).toHaveLength(1);
    expect(low[0].balance.toNumber()).toBe(1);
  });
});

describe("milestone status engine", () => {
  const now = new Date("2026-07-07T00:00:00Z");

  it("PAID when receipts cover the amount", () => {
    const s = computeMilestoneStatus(
      { amount: 100000, dueBasis: "DATE", dueDate: new Date("2026-01-01") },
      [{ amount: 100000 }],
      now,
    );
    expect(s).toBe("PAID");
  });

  it("PARTIALLY_PAID with a partial receipt", () => {
    const s = computeMilestoneStatus(
      { amount: 100000, dueBasis: "DATE", dueDate: new Date("2026-01-01") },
      [{ amount: 40000 }],
      now,
    );
    expect(s).toBe("PARTIALLY_PAID");
  });

  it("DUE by date when past due and unpaid", () => {
    const s = computeMilestoneStatus(
      { amount: 100000, dueBasis: "DATE", dueDate: new Date("2026-06-01") },
      [],
      now,
    );
    expect(s).toBe("DUE");
  });

  it("DUE by stage completion", () => {
    const s = computeMilestoneStatus(
      { amount: 100000, dueBasis: "STAGE_COMPLETION", linkedStageStatus: "DONE" },
      [],
      now,
    );
    expect(s).toBe("DUE");
  });

  it("UPCOMING when stage not done and no date passed", () => {
    const s = computeMilestoneStatus(
      { amount: 100000, dueBasis: "STAGE_COMPLETION", linkedStageStatus: "IN_PROGRESS" },
      [],
      now,
    );
    expect(s).toBe("UPCOMING");
  });

  it("daysOverdue counts only past-due", () => {
    expect(daysOverdue(new Date("2026-07-01"), now)).toBe(6);
    expect(daysOverdue(new Date("2026-08-01"), now)).toBe(0);
    expect(daysOverdue(null, now)).toBe(0);
  });
});

describe("document numbering", () => {
  it("formats sequential numbers with padding", () => {
    expect(formatDocNumber("GEC-INV", 2026, 1)).toBe("GEC-INV-2026-001");
    expect(formatDocNumber("GEC-ORD", 2026, 42)).toBe("GEC-ORD-2026-042");
  });
  it("round-trips via parse", () => {
    expect(parseDocNumber("GEC-INV-2026-007")).toEqual({
      prefix: "GEC-INV",
      year: 2026,
      seq: 7,
    });
    expect(parseDocNumber("not-a-number")).toBeNull();
  });
});
