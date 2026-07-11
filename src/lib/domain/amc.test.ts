import { describe, it, expect } from "vitest";
import {
  generateVisitSchedule,
  visitStatusFor,
  slaHoursForPriority,
  slaDueDate,
  isSlaBreached,
  contractStatusFor,
  daysToExpiry,
} from "./amc";

describe("AMC preventive-maintenance scheduling", () => {
  it("generates ~visitsPerYear evenly-spaced dates for a 1-year contract", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    const dates = generateVisitSchedule(start, end, 4);
    expect(dates.length).toBe(4); // quarterly
    // all within the window, strictly increasing
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
    expect(dates[0].getTime()).toBeGreaterThan(start.getTime());
    expect(dates[dates.length - 1].getTime()).toBeLessThanOrEqual(end.getTime() + 86_400_000);
  });

  it("monthly gives 12 visits over a year", () => {
    expect(generateVisitSchedule(new Date("2026-01-01"), new Date("2026-12-31"), 12).length).toBe(12);
  });

  it("never returns an empty schedule", () => {
    expect(generateVisitSchedule(new Date("2026-01-01"), new Date("2026-01-15"), 4).length).toBeGreaterThanOrEqual(1);
  });
});

describe("visit status engine", () => {
  const sched = new Date("2026-06-15");
  it("DONE when completed", () => {
    expect(visitStatusFor(sched, new Date("2026-06-16"))).toBe("DONE");
  });
  it("UPCOMING before the date", () => {
    expect(visitStatusFor(sched, null, new Date("2026-06-01"))).toBe("UPCOMING");
  });
  it("DUE within the grace window", () => {
    expect(visitStatusFor(sched, null, new Date("2026-06-18"))).toBe("DUE");
  });
  it("MISSED once well past", () => {
    expect(visitStatusFor(sched, null, new Date("2026-07-01"))).toBe("MISSED");
  });
});

describe("ticket SLA", () => {
  it("maps priority to response hours", () => {
    expect(slaHoursForPriority("CRITICAL")).toBe(4);
    expect(slaHoursForPriority("HIGH")).toBe(24);
    expect(slaHoursForPriority("MEDIUM")).toBe(72);
    expect(slaHoursForPriority("LOW")).toBe(168);
  });
  it("computes an SLA due date and detects breach", () => {
    const created = new Date("2026-06-15T09:00:00Z");
    const due = slaDueDate("CRITICAL", created);
    expect(due.getTime()).toBe(created.getTime() + 4 * 3_600_000);
    expect(isSlaBreached(due, false, new Date("2026-06-15T14:00:00Z"))).toBe(true);
    expect(isSlaBreached(due, false, new Date("2026-06-15T12:00:00Z"))).toBe(false);
    expect(isSlaBreached(due, true, new Date("2026-06-16"))).toBe(false); // resolved
  });
});

describe("contract status + expiry", () => {
  it("ACTIVE inside window, EXPIRED after", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    expect(contractStatusFor(start, end, new Date("2026-06-01"))).toBe("ACTIVE");
    expect(contractStatusFor(start, end, new Date("2027-01-05"))).toBe("EXPIRED");
  });
  it("counts days to expiry", () => {
    expect(daysToExpiry(new Date("2026-06-20"), new Date("2026-06-13"))).toBe(7);
  });
});
