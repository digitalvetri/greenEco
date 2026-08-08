import { describe, it, expect } from "vitest";
import { leadScore, leadCompleteness, type LeadCompletenessInput } from "./lead-score";

const EMPTY_COMPLETENESS: LeadCompletenessInput = {
  contactCount: 0,
  hasLoggedMeeting: false,
  hasUpcomingMeeting: false,
};

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

describe("leadCompleteness", () => {
  it("a bare lead with nothing filled is 0%", () => {
    expect(leadCompleteness(EMPTY_COMPLETENESS)).toBe(0);
  });

  it("a fully-filled lead is 100%", () => {
    const full: LeadCompletenessInput = {
      state: "Tamil Nadu",
      email: "a@b.com",
      leadType: "Builder/Developers",
      howMet: "Referred by",
      projectName: "X",
      projectAddress: "Y",
      contactCount: 1,
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 20,
      segment: "Apartment",
      budgetBand: "₹5–15L",
      decisionTimeline: "1–3 months",
      inletBOD: 200,
      inletCOD: 400,
      inletTSS: 150,
      inletTDS: 500,
      hasLoggedMeeting: true,
      hasUpcomingMeeting: true,
    };
    expect(leadCompleteness(full)).toBe(100);
  });

  it("is monotonic — filling in one more field never lowers the %", () => {
    const before = leadCompleteness(EMPTY_COMPLETENESS);
    const after = leadCompleteness({ ...EMPTY_COMPLETENESS, state: "Kerala" });
    expect(after).toBeGreaterThan(before);
  });

  it("a zero/negative capacity does not count as filled", () => {
    const withZero = leadCompleteness({ ...EMPTY_COMPLETENESS, capacityKLD: 0 });
    expect(withZero).toBe(0);
  });

  it("partial inlet readings (not all four) don't count as filled", () => {
    const partial = leadCompleteness({ ...EMPTY_COMPLETENESS, inletBOD: 200, inletCOD: 400 });
    expect(partial).toBe(0);
  });
});
