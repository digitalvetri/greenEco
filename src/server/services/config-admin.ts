import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Ctx } from "@/lib/rbac";
import { encryptSecret } from "@/lib/secrets-crypto";
import {
  MANAGED_KEYS,
  isManagedKey,
  loadConfig,
  loadConfigSources,
  invalidateConfig,
  type ManagedKey,
} from "@/lib/runtime-config";

/**
 * Admin surface for the runtime integration config (Settings → Integrations). Reads build a
 * SAFE projection — secret values are NEVER returned to the browser (only `configured` +
 * `last4` + `source`); non-secret values (models, from-address, provider preference) are
 * returned so they can be edited in place. Writes encrypt at rest, audit the key name (never
 * the value), and bust the cache so a saved key is live on the next request — no restart.
 */

export interface ConfigItemView {
  key: ManagedKey;
  label: string;
  group: string;
  secret: boolean;
  help?: string;
  placeholder?: string;
  configured: boolean;
  /** DB-overridden, plain .env value, or not set at all. */
  source: "db" | "env" | "unset";
  /** Last 4 chars of a configured secret (recognition only). Absent for non-secrets. */
  last4?: string;
  /** Full value for NON-secret fields only (models, EMAIL_FROM, provider). */
  value?: string;
}

export interface ConfigGroupView {
  group: string;
  items: ConfigItemView[];
}

export async function getConfigOverview(ctx: Ctx): Promise<ConfigGroupView[]> {
  requireAdmin(ctx);
  const [cfg, fromDb] = await Promise.all([loadConfig(ctx.companyId), loadConfigSources(ctx.companyId)]);

  const groups = new Map<string, ConfigItemView[]>();
  for (const meta of MANAGED_KEYS) {
    const resolved = cfg[meta.key] ?? "";
    const configured = resolved.trim().length > 0;
    const source: ConfigItemView["source"] = fromDb.has(meta.key) ? "db" : configured ? "env" : "unset";
    const item: ConfigItemView = {
      key: meta.key,
      label: meta.label,
      group: meta.group,
      secret: meta.secret,
      help: meta.help,
      placeholder: meta.placeholder,
      configured,
      source,
    };
    if (meta.secret) {
      if (configured && resolved.length >= 4) item.last4 = resolved.slice(-4);
    } else {
      item.value = resolved; // non-secret — safe to show/edit
    }
    if (!groups.has(meta.group)) groups.set(meta.group, []);
    groups.get(meta.group)!.push(item);
  }

  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

const PROVIDER_VALUES = new Set(["auto", "groq", "gemini", "anthropic"]);

/** Save (or, on empty input, clear) one managed key. Returns {ok} or {ok:false,error}. */
export async function setConfigValue(ctx: Ctx, key: string, rawValue: string): Promise<{ ok: boolean; error?: string }> {
  requireAdmin(ctx);
  if (!isManagedKey(key)) return { ok: false, error: "Unknown setting" };

  const value = rawValue.trim();
  // Empty input means "clear this override and fall back to .env".
  if (value.length === 0) return clearConfigValue(ctx, key);

  if (key === "AI_TEXT_PROVIDER" && !PROVIDER_VALUES.has(value)) {
    return { ok: false, error: "Provider must be one of: auto, groq, gemini, anthropic" };
  }

  await prisma.configSetting.upsert({
    where: { companyId_key: { companyId: ctx.companyId, key } },
    create: { companyId: ctx.companyId, key, valueEnc: encryptSecret(value), updatedById: ctx.userId },
    update: { valueEnc: encryptSecret(value), updatedById: ctx.userId },
  });
  // Audit the KEY only — never the secret value (mirrors password-change discipline).
  await logAudit(ctx, { action: "UPDATE", entity: "ConfigSetting", entityId: key, after: { changed: true } });
  invalidateConfig(ctx.companyId);
  return { ok: true };
}

export async function clearConfigValue(ctx: Ctx, key: string): Promise<{ ok: boolean; error?: string }> {
  requireAdmin(ctx);
  if (!isManagedKey(key)) return { ok: false, error: "Unknown setting" };
  await prisma.configSetting.deleteMany({ where: { companyId: ctx.companyId, key } });
  await logAudit(ctx, { action: "UPDATE", entity: "ConfigSetting", entityId: key, after: { cleared: true } });
  invalidateConfig(ctx.companyId);
  return { ok: true };
}
