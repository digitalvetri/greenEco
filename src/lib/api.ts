import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, getSession, type Session } from "./auth";
import { check, clientIp, type RateLimitResult } from "./rate-limit";

/** Thrown by rateLimit() when a caller exceeds a bucket; mapped to 429 below. */
export class RateLimitError extends Error {
  constructor(public result: RateLimitResult) {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

/**
 * Enforce a per-caller rate bucket inside a handler. Prefer a user-scoped key
 * (post-auth) so one tenant can't exhaust another's budget; fall back to IP for
 * pre-auth routes.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const r = check(key, limit, windowMs);
  if (!r.ok) throw new RateLimitError(r);
}

export { clientIp };

/**
 * Wrap a route handler: injects the session, maps AuthError/ZodError to proper
 * HTTP status. Keeps handlers thin (spec §3) — logic stays in services.
 */
export function api<T>(fn: (session: Session, req: Request) => Promise<T>) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const session = await getSession();
      const result = await fn(session, req);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      if (e instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429, headers: { "retry-after": String(e.result.retryAfterSec) } },
        );
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Validation failed", issues: e.issues }, { status: 422 });
      }
      const message = e instanceof Error ? e.message : "Internal error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
