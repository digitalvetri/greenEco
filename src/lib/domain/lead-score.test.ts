import { describe, it, expect } from "vitest";
import { leadScore } from "./lead-score";

describe("leadScore", () => {
  it("a large, well-budgeted, imminent, price-discussing lead is HOT", () => {
    const r = leadScore({
      capacityKLD: 120,
      budgetBand: "Above ₹1Cr",
      decisionTimeline: "Immediate (<1 mo)",
      source: "Consultant",
      latestOutcome: "PRICE_DISCUSSION",
    });
    expect(r.temperature).toBe("HOT");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("a bare new lead with nothing filled is COLD", () => {
    const r = leadScore({ source: "Other" });
    expect(r.temperature).toBe("COLD");
    expect(r.score).toBeLessThan(30);
  });

  it("a mid-size lead with soft signals lands WARM", () => {
    // 20 KLD (15) + ₹5–15L (10) + 3–6 months (8) + Other (2) + no follow-up (5) = 40
    const r = leadScore({
      capacityKLD: 20,
      budgetBand: "₹5–15L",
      decisionTimeline: "3–6 months",
      source: "Other",
    });
    expect(r.temperature).toBe("WARM");
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.score).toBeLessThan(60);
  });

  it("is deterministic (same input → same score)", () => {
    const input = { capacityKLD: 40, budgetBand: "₹5–15L", source: "Builder" };
    expect(leadScore(input).score).toBe(leadScore(input).score);
  });

  it("an explicit NEGATIVE outcome scores lower than no follow-up (neutral 5)", () => {
    const base = { capacityKLD: 20, source: "Reference" };
    const negative = leadScore({ ...base, latestOutcome: "NEGATIVE" });
    const none = leadScore({ ...base });
    expect(negative.score).toBeLessThan(none.score);
  });

  it("higher capacity never lowers the score (monotonic)", () => {
    const small = leadScore({ capacityKLD: 10, source: "Other" }).score;
    const large = leadScore({ capacityKLD: 100, source: "Other" }).score;
    expect(large).toBeGreaterThan(small);
  });
});
