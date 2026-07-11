import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

/**
 * Short-lived HMAC tokens for server-side PDF rendering.
 *
 * The PDF generator drives a headless browser to GET /print/<doc>/<id>. That
 * request carries no Clerk session cookie, so the print pages accept a signed
 * token instead — bound to the exact document (docType + docId) and to the
 * admin who requested it, expiring in minutes. It is NOT a general auth bypass:
 *   - it only satisfies /print/* pages (never a mutating route),
 *   - it names one document, so a token for invoice A can't render invoice B,
 *   - it carries the requester's role so field-stripping still applies.
 *
 * Token format:  v1.<base64url(payload)>.<base64url(hmac)>
 */

export interface PrintClaims {
  docType: "invoice" | "proposal" | "closeout";
  docId: string;
  /** The admin who requested the render; passed through to the print page. */
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  companyId: string;
  /** Unix seconds. */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 120;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", env.printTokenSecret).update(`v1.${payloadB64}`).digest());
}

/** Mint a token. `now` is injectable for deterministic tests. */
export function signPrintToken(
  claims: Omit<PrintClaims, "exp">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
): string {
  const full: PrintClaims = { ...claims, exp: Math.floor(now / 1000) + ttlSeconds };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(full)));
  return `v1.${payloadB64}.${sign(payloadB64)}`;
}

export type VerifyResult =
  | { ok: true; claims: PrintClaims }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/** Verify a token. Constant-time signature check; returns the claims on success. */
export function verifyPrintToken(token: string, now = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, payloadB64, sigB64] = parts;

  const expected = sign(payloadB64);
  const a = fromB64url(sigB64);
  const b = fromB64url(expected);
  // Length guard before timingSafeEqual (which throws on mismatched lengths).
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };

  let claims: PrintClaims;
  try {
    claims = JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
