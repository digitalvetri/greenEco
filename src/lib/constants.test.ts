import { describe, it, expect } from "vitest";
import { deriveCapacityKLD } from "./constants";

describe("deriveCapacityKLD", () => {
  it("passes KLD through unchanged", () => {
    expect(deriveCapacityKLD(50, "KLD")).toBe(50);
  });

  it("converts LPH to KLD (litres/hour -> kilolitres/day)", () => {
    // 1000 LPH * 24h / 1000 = 24 KLD
    expect(deriveCapacityKLD(1000, "LPH")).toBe(24);
  });

  it("returns 0 for a different dimension (Kg/Day, Tons/Day) — no fabricated flow rate", () => {
    expect(deriveCapacityKLD(500, "Kg/Day")).toBe(0);
    expect(deriveCapacityKLD(5, "Tons/Day")).toBe(0);
  });

  it("returns 0 for a zero or negative value regardless of unit", () => {
    expect(deriveCapacityKLD(0, "KLD")).toBe(0);
    expect(deriveCapacityKLD(-5, "LPH")).toBe(0);
  });

  it("treats an unrecognized unit as already KLD (safe default)", () => {
    expect(deriveCapacityKLD(30, "")).toBe(30);
  });
});
