/**
 * Minimal structured logger (Phase 1). Emits one JSON object per line so a log
 * collector (Loki/CloudWatch/Datadog) can parse fields without regex. No deps.
 *
 * Not a full logging framework — deliberately. It gives level, timestamp, a
 * message, and arbitrary context; that's what routes/services need to be
 * greppable in production. Swap the sink here if you adopt one later.
 */

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// LOG_LEVEL is read raw (not via env.ts) so logging works even if env validation
// is what failed — a logger that needs valid config can't report config errors.
const MIN = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? ORDER.info;

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (ORDER[level] < MIN) return;
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...ctx,
  });
  // error/warn → stderr, rest → stdout (standard stream separation).
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);

  // Forward errors to an optional collector (Sentry-style upgrade path lives in
  // the runbook). Read raw to avoid a logger→env import cycle; fire-and-forget.
  if (level === "error" && process.env.ERROR_WEBHOOK_URL) {
    void forwardError(process.env.ERROR_WEBHOOK_URL, line);
  }
}

async function forwardError(url: string, payload: string): Promise<void> {
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  } catch {
    // Never let error reporting throw — it would mask the original error.
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

/** Normalize an unknown thrown value into loggable fields. */
export function errFields(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.message, stack: e.stack };
  return { error: String(e) };
}
