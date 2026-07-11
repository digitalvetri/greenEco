import { describe, it, expect } from "vitest";
import { formatIndianNumber, formatINR, amountInWords, round2, add } from "./money";

describe("Indian number formatting", () => {
  it("groups lakhs/crores correctly", () => {
    expect(formatIndianNumber(150000)).toBe("1,50,000");
    expect(formatIndianNumber(1000)).toBe("1,000");
    expect(formatIndianNumber(10000000)).toBe("1,00,00,000");
    expect(formatIndianNumber(999)).toBe("999");
  });

  it("keeps paise when present", () => {
    expect(formatIndianNumber(150000.5)).toBe("1,50,000.50");
    expect(formatINR(150000)).toBe("₹1,50,000");
  });

  it("handles negatives", () => {
    expect(formatIndianNumber(-1500)).toBe("-1,500");
  });
});

describe("amountInWords (Indian system)", () => {
  it("formats common invoice values", () => {
    expect(amountInWords(150000)).toBe("Rupees One Lakh Fifty Thousand Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(118000)).toBe("Rupees One Lakh Eighteen Thousand Only");
  });

  it("handles crores and paise", () => {
    expect(amountInWords(12500000)).toBe("Rupees One Crore Twenty Five Lakh Only");
    expect(amountInWords(100.5)).toBe("Rupees One Hundred and Fifty Paise Only");
  });
});

describe("decimal arithmetic", () => {
  it("adds without float drift", () => {
    expect(add(0.1, 0.2).toString()).toBe("0.3");
  });
  it("rounds half up to paise", () => {
    expect(round2(1.005).toFixed(2)).toBe("1.01");
  });
});
