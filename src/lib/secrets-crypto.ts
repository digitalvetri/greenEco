import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "./env";

/**
 * Symmetric encryption for the runtime config store (`ConfigSetting.valueEnc`).
 * AES-256-GCM; the 32-byte key is derived from SESSION_SECRET via scrypt. That root is
 * deliberately env-only (never storable in the config table) so the thing that decrypts
 * the store can't live inside it. If SESSION_SECRET is rotated, existing ciphertexts stop
 * decrypting — `decryptSecret` returns null and callers fall back to .env (re-enter keys).
 *
 * Server-only. Never import from a "use client" module.
 */

// Derived once at module load. scrypt is intentionally slow but this runs a single time.
const KEY = scryptSync(env.sessionSecret, "greeneco-config-v1", 32);
const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;

/** Encrypt UTF-8 plaintext → base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a value produced by `encryptSecret`. Returns null on any tampering/format/key
 *  mismatch so callers degrade to the .env fallback rather than throwing. */
export function decryptSecret(enc: string): string | null {
  try {
    const buf = Buffer.from(enc, "base64");
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
