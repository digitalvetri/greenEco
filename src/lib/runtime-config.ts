import { prisma } from "./prisma";
import { env } from "./env";
import { decryptSecret } from "./secrets-crypto";

/**
 * Runtime integration config: DB (`ConfigSetting`) overrides the matching .env value at
 * request time, so an admin can paste/rotate keys in Settings → Integrations with no
 * restart. Only per-call integration keys live here; auth/session/storage roots stay
 * env-only (see AGENTS.md). Values are decrypted from the store, merged over env, and
 * cached for a few seconds to avoid a DB hit on every WhatsApp/email/AI call. Writes call
 * `invalidateConfig()` so a saved key is visible on the very next request.
 *
 * Server-only. Never import from a "use client" module.
 */

export type ManagedKey =
  | "CRON_KEY"
  | "WHATSAPP_TOKEN"
  | "WHATSAPP_PHONE_ID"
  | "WHATSAPP_WEBHOOK_URL"
  | "WHATSAPP_VERIFY_TOKEN"
  | "WHATSAPP_APP_SECRET"
  | "RESEND_API_KEY"
  | "EMAIL_FROM"
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_MODEL"
  | "GROQ_API_KEY"
  | "GROQ_MODEL"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
  | "AI_TEXT_PROVIDER";

export interface KeyMeta {
  key: ManagedKey;
  label: string;
  group: "Cron" | "WhatsApp" | "Email" | "AI";
  /** Secret → never echoed to the browser (masked). Non-secret → value shown/editable. */
  secret: boolean;
  /** How to read the compile-time default from validated env. */
  envValue: () => string;
  placeholder?: string;
  help?: string;
}

/** The allowlist. Anything not here can't be written from the Settings page. */
export const MANAGED_KEYS: KeyMeta[] = [
  { key: "CRON_KEY", label: "Cron key", group: "Cron", secret: true, envValue: () => env.cronKey, placeholder: "openssl rand -hex 32", help: "Shared secret the scheduler sends as x-cron-key." },

  { key: "WHATSAPP_TOKEN", label: "WhatsApp token", group: "WhatsApp", secret: true, envValue: () => env.whatsappToken, placeholder: "EAAG… (permanent token)", help: "Cloud API access token (System User)." },
  { key: "WHATSAPP_PHONE_ID", label: "WhatsApp phone number ID", group: "WhatsApp", secret: false, envValue: () => env.whatsappPhoneId, placeholder: "1234567890" },
  // Masked as a secret: an n8n webhook URL often embeds a path token that acts as a send credential.
  { key: "WHATSAPP_WEBHOOK_URL", label: "WhatsApp n8n relay URL", group: "WhatsApp", secret: true, envValue: () => env.whatsappWebhookUrl, placeholder: "https://n8n…/webhook/…", help: "Alternative to the Cloud API token pair." },
  { key: "WHATSAPP_VERIFY_TOKEN", label: "WhatsApp verify token", group: "WhatsApp", secret: true, envValue: () => env.whatsappVerifyToken, help: "For inbound webhook verification." },
  { key: "WHATSAPP_APP_SECRET", label: "WhatsApp app secret", group: "WhatsApp", secret: true, envValue: () => env.whatsappAppSecret, help: "For inbound signature checks." },

  { key: "RESEND_API_KEY", label: "Resend API key", group: "Email", secret: true, envValue: () => env.resendApiKey, placeholder: "re_…" },
  { key: "EMAIL_FROM", label: "From address", group: "Email", secret: false, envValue: () => env.emailFrom, placeholder: "Green Ecocare <noreply@domain.com>" },

  { key: "ANTHROPIC_API_KEY", label: "Anthropic (Claude) key", group: "AI", secret: true, envValue: () => env.anthropicApiKey, placeholder: "sk-ant-…", help: "Proposals + bill-photo vision." },
  { key: "ANTHROPIC_MODEL", label: "Anthropic model", group: "AI", secret: false, envValue: () => env.anthropicModel },
  { key: "GROQ_API_KEY", label: "Groq key", group: "AI", secret: true, envValue: () => env.groqApiKey, placeholder: "gsk_…", help: "Fast, free-tier text (brief + proposals)." },
  { key: "GROQ_MODEL", label: "Groq model", group: "AI", secret: false, envValue: () => env.groqModel },
  { key: "GEMINI_API_KEY", label: "Google Gemini key", group: "AI", secret: true, envValue: () => env.geminiApiKey, placeholder: "AIza…", help: "Text + vision alternative to Claude." },
  { key: "GEMINI_MODEL", label: "Gemini model", group: "AI", secret: false, envValue: () => env.geminiModel },
  { key: "AI_TEXT_PROVIDER", label: "Preferred text provider", group: "AI", secret: false, envValue: () => env.aiTextProvider, help: "auto | groq | gemini | anthropic" },
];

const META_BY_KEY = new Map(MANAGED_KEYS.map((m) => [m.key, m]));

export function isManagedKey(k: string): k is ManagedKey {
  return META_BY_KEY.has(k as ManagedKey);
}

export type ResolvedConfig = Record<ManagedKey, string>;

interface CacheEntry {
  values: ResolvedConfig;
  /** Raw DB presence per key (before env fallback) — powers the admin "source" projection. */
  fromDb: Set<ManagedKey>;
  expires: number;
}

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

// `now()` is isolated so the (small) purity concern stays in one place; not used in render.
function envDefaults(): ResolvedConfig {
  return Object.fromEntries(MANAGED_KEYS.map((m) => [m.key, m.envValue()])) as ResolvedConfig;
}

async function buildEntry(companyId: string): Promise<CacheEntry> {
  const values = envDefaults();
  const fromDb = new Set<ManagedKey>();
  try {
    const rows = await prisma.configSetting.findMany({ where: { companyId } });
    for (const row of rows) {
      if (!isManagedKey(row.key)) continue;
      const plain = decryptSecret(row.valueEnc);
      // Empty/failed-decrypt → keep the env fallback (a saved-then-cleared key shouldn't mask env).
      if (plain != null && plain.trim().length > 0) {
        values[row.key] = plain;
        fromDb.add(row.key);
      }
    }
  } catch {
    // DB unreachable (unit tests / outage) → env-only config, never throw from a read.
  }
  return { values, fromDb, expires: Date.now() + CACHE_TTL_MS };
}

/** Resolved integration config (DB over env), cached briefly. Defaults to the single tenant. */
export async function loadConfig(companyId: string = env.companyId): Promise<ResolvedConfig> {
  const hit = cache.get(companyId);
  if (hit && hit.expires > Date.now()) return hit.values;
  const entry = await buildEntry(companyId);
  cache.set(companyId, entry);
  return entry.values;
}

/** Which keys are currently sourced from the DB (vs env). For the admin projection only. */
export async function loadConfigSources(companyId: string = env.companyId): Promise<Set<ManagedKey>> {
  const hit = cache.get(companyId);
  if (hit && hit.expires > Date.now()) return hit.fromDb;
  const entry = await buildEntry(companyId);
  cache.set(companyId, entry);
  return entry.fromDb;
}

/** Drop the cache so a just-saved value is seen on the next request. */
export function invalidateConfig(companyId?: string): void {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}
