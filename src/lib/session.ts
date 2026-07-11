import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

/**
 * Stateless signed session cookie (no session table needed). Payload is
 * base64url(JSON {uid, exp}) with an HMAC-SHA256 signature over it. Fails closed:
 * a tampered or expired token verifies to null. httpOnly + SameSite=Lax; Secure in prod.
 */
export const SESSION_COOKIE = "gc_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(payload: string): string {
  return b64url(createHmac("sha256", env.sessionSecret).update(payload).digest());
}

export function createSessionToken(userId: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, exp: nowSec + MAX_AGE_SEC })));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, nowSec = Math.floor(Date.now() / 1000)): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null; // tampered
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) as { uid?: string; exp?: number };
    if (!uid || !exp || exp < nowSec) return null; // expired / malformed
    return uid;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SEC;
