import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log, errFields } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe (Phase 1). Unauthenticated (excluded from the
 * Clerk matcher) so uptime monitors and container orchestrators can hit it.
 *   200 {status:"ok"}        — app up, DB reachable
 *   503 {status:"degraded"}  — app up, DB unreachable  (fail readiness, not liveness)
 */
export async function GET() {
  const startedAt = Date.now();
  let db: "ok" | "down" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    db = "down";
    log.error("healthz: db check failed", errFields(e));
  }

  const body = {
    status: db === "ok" ? "ok" : "degraded",
    checks: { db },
    version: process.env.APP_VERSION ?? "dev",
    uptimeSec: Math.round(process.uptime()),
    latencyMs: Date.now() - startedAt,
  };
  return NextResponse.json(body, { status: db === "ok" ? 200 : 503 });
}
