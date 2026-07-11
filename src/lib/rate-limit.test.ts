import { describe, it, expect, beforeEach } from "vitest";
import { check, _reset } from "./rate-limit";

describe("rate-limit (fixed window)", () => {
  beforeEach(() => _reset());

  it("allows up to the limit, then blocks", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(check("k", 5, 60_000, t0).ok).toBe(true);
    }
    const blocked = check("k", 5, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 5; i++) check("k", 5, 60_000, t0);
    expect(check("k", 5, 60_000, t0).ok).toBe(false);
    // 61s later → new window
    expect(check("k", 5, 60_000, t0 + 61_000).ok).toBe(true);
  });

  it("isolates keys", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 5; i++) check("a", 5, 60_000, t0);
    expect(check("a", 5, 60_000, t0).ok).toBe(false);
    expect(check("b", 5, 60_000, t0).ok).toBe(true);
  });

  it("reports decreasing remaining", () => {
    const t0 = 4_000_000;
    expect(check("k", 3, 60_000, t0).remaining).toBe(2);
    expect(check("k", 3, 60_000, t0).remaining).toBe(1);
    expect(check("k", 3, 60_000, t0).remaining).toBe(0);
  });
});
