import { describe, it, expect } from "vitest";
import { proposalExpiry } from "./proposal-aging";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("proposalExpiry", () => {
  it("is null for non-live statuses (DRAFT/WON/LOST)", () => {
    expect(proposalExpiry({ status: "DRAFT", versionCreatedAt: daysAgo(60), validityDays: 30 })).toBeNull();
    expect(proposalExpiry({ status: "WON", versionCreatedAt: daysAgo(60), validityDays: 30 })).toBeNull();
  });

  it("flags a SENT quote past its validity as expired", () => {
    const r = proposalExpiry({ status: "SENT", versionCreatedAt: daysAgo(40), validityDays: 30 });
    expect(r?.state).toBe("expired");
    expect(r!.daysLeft).toBeLessThan(0);
  });

  it("flags a quote within 7 days of expiry as expiring", () => {
    const r = proposalExpiry({ status: "SENT", versionCreatedAt: daysAgo(25), validityDays: 30 });
    expect(r?.state).toBe("expiring");
    expect(r!.daysLeft).toBeGreaterThanOrEqual(0);
    expect(r!.daysLeft).toBeLessThanOrEqual(7);
  });

  it("a fresh SENT quote is active", () => {
    expect(proposalExpiry({ status: "SENT", versionCreatedAt: daysAgo(2), validityDays: 30 })?.state).toBe("active");
  });

  it("UNDER_NEGOTIATION is also subject to expiry", () => {
    expect(proposalExpiry({ status: "UNDER_NEGOTIATION", versionCreatedAt: daysAgo(40), validityDays: 30 })?.state).toBe("expired");
  });
});
