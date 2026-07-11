import { log } from "./logger";

/**
 * Fixed-window in-memory rate limiter (Phase 1).
 *
 * SCOPE (be honest): this counts within a single Node process. It protects a
 * single-instance deployment (Coolify one-container) against bursts/abuse. For
 * horizontal scaling, back it with Redis (INCR + EXPIRE) — the check() contract
 * below is the seam to swap. It is NOT a substitute for an upstream WAF.
 *
 * Memory is bounded by pruning expired windows on each check.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();
let lastPrune = 0;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/**
 * @param key    caller identity + bucket, e.g. `pdf:${userId}` or `upload:${ip}`
 * @param limit  max requests per window
 * @param windowMs  window length in ms
 * @param now    injectable clock (tests)
 */
export function check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  // Opportunistic prune (at most once per window) so the map can't grow forever.
  if (now - lastPrune > windowMs) {
    for (const [k, w] of store) if (w.resetAt <= now) store.delete(k);
    lastPrune = now;
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const w = { count: 1, resetAt: now + windowMs };
    store.set(key, w);
    return { ok: true, remaining: limit - 1, resetAt: w.resetAt, retryAfterSec: 0 };
  }

  existing.count += 1;
  const ok = existing.count <= limit;
  if (!ok) {
    log.warn("rate limit exceeded", { key, limit, windowMs });
  }
  return {
    ok,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSec: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Best-effort client IP from proxy headers (Coolify/nginx set x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Reset all state — test helper. */
export function _reset(): void {
  store.clear();
  lastPrune = 0;
}
