import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/rbac";

/**
 * Production readiness snapshot for the Settings page: which integrations are wired,
 * derived from env flags only — never exposes a secret value. Gated auth/email/WhatsApp
 * fail closed (log-only) when unset, so this tells an admin what will actually happen.
 */

export interface SystemStatusItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface SystemStatus {
  auth: SystemStatusItem[];
  integrations: SystemStatusItem[];
  observability: SystemStatusItem[];
  liveCount: number;
  total: number;
}

export function getSystemStatus(ctx: Ctx): SystemStatus {
  requireAdmin(ctx);
  const has = (s: string | undefined | null) => !!s && s.trim().length > 0;

  const isProd = env.authMode === "clerk";
  const strongSession = has(env.sessionSecret) && env.sessionSecret !== "dev-insecure-session-secret";
  const whatsappDirect = has(env.whatsappToken) && has(env.whatsappPhoneId);
  const whatsappRelay = has(env.whatsappWebhookUrl);
  const whatsappInbound = has(env.whatsappVerifyToken) && has(env.whatsappAppSecret);
  const email = has(env.resendApiKey) && has(env.emailFrom);

  const auth: SystemStatusItem[] = [
    {
      key: "auth",
      label: "Authentication",
      ok: isProd,
      detail: isProd ? "Clerk (production)" : "Dev credentials login (email + password)",
    },
    {
      key: "session",
      label: "Session secret",
      ok: strongSession,
      detail: strongSession ? "Set (≥32 chars)" : "Using the insecure dev default — set SESSION_SECRET",
    },
    {
      key: "storage",
      label: "File storage",
      ok: env.storageDriver === "s3",
      detail: env.storageDriver === "s3" ? "S3 / R2 (durable)" : "Local disk — files are lost on redeploy",
    },
  ];

  const integrations: SystemStatusItem[] = [
    {
      key: "whatsapp",
      label: "WhatsApp (outbound)",
      ok: whatsappDirect || whatsappRelay,
      detail: whatsappDirect ? "Cloud API (direct)" : whatsappRelay ? "n8n relay" : "Not set — messages are logged, not sent",
    },
    {
      key: "whatsapp_inbound",
      label: "WhatsApp (inbound)",
      ok: whatsappInbound,
      detail: whatsappInbound ? "Webhook verify + signature set" : "Not set — inbound replies not received",
    },
    {
      key: "email",
      label: "Email (Resend)",
      ok: email,
      detail: email ? "Configured" : "Not set — emails are logged, not sent",
    },
    {
      key: "ai",
      label: "AI proposal drafts",
      ok: has(env.anthropicApiKey),
      detail: has(env.anthropicApiKey) ? "Anthropic API" : "Not set — falls back to KLD-band templates",
    },
    {
      key: "cron",
      label: "Cron authentication",
      ok: has(env.cronKey),
      detail: has(env.cronKey) ? "CRON_KEY set" : "Not set — /api/cron is unauthenticated",
    },
  ];

  const observability: SystemStatusItem[] = [
    {
      key: "error_webhook",
      label: "Error forwarding",
      ok: has(env.errorWebhookUrl),
      detail: has(env.errorWebhookUrl) ? "Errors forwarded to webhook" : "Not set — errors only in server logs (Sentry-ready)",
    },
  ];

  const all = [...auth, ...integrations, ...observability];
  return { auth, integrations, observability, liveCount: all.filter((i) => i.ok).length, total: all.length };
}
