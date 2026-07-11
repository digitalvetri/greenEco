import { z } from "zod";

/**
 * Validated environment (Phase 0 — fail fast at boot rather than at request time).
 * Server-only: never import this from a "use client" module.
 *
 * Conditional requirements:
 *   AUTH_MODE=clerk      → Clerk publishable + secret keys
 *   STORAGE_DRIVER=s3    → S3/R2 endpoint, keys, bucket
 */
const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    AUTH_MODE: z.enum(["dev", "clerk"]).default("dev"),
    DEV_ROLE: z.enum(["ADMIN", "EMPLOYEE"]).default("ADMIN"),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_WEBHOOK_SECRET: z.string().optional(),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    /** Public base URL files are served from (CDN / R2 public bucket). */
    S3_PUBLIC_URL: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

    DEFAULT_COMPANY_ID: z.string().default("green-ecocare"),
    COMPANY_GSTIN: z.string().default(""),
    COMPANY_STATE_CODE: z.string().default("33"),
    INVOICE_PREFIX: z.string().default("GEC-INV"),
    ORDER_PREFIX: z.string().default("GEC-ORD"),
    PROPOSAL_PREFIX: z.string().default("GEC-PRO"),
    PO_PREFIX: z.string().default("GEC-PO"),
    AMC_PREFIX: z.string().default("GEC-AMC"),
    TICKET_PREFIX: z.string().default("GEC-TKT"),
    GRN_PREFIX: z.string().default("GEC-GRN"),

    AUTO_APPROVE_LIMIT: z.coerce.number().min(0).default(0),
    MIN_MARGIN_PCT: z.coerce.number().min(0).max(1).default(0.1),

    NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
    ANTHROPIC_API_KEY: z.string().default(""),
    ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
    /** Shared secret for /api/cron; empty = unauthenticated (dev only). */
    CRON_KEY: z.string().default(""),
    /** n8n relay for WhatsApp; empty = messages are no-ops. */
    WHATSAPP_WEBHOOK_URL: z.string().default(""),
    /** Direct WhatsApp Cloud API (preferred over n8n if both set). */
    WHATSAPP_TOKEN: z.string().default(""),
    WHATSAPP_PHONE_ID: z.string().default(""),
    /** Token Meta echoes on webhook verification; app secret for signature check. */
    WHATSAPP_VERIFY_TOKEN: z.string().default(""),
    WHATSAPP_APP_SECRET: z.string().default(""),

    /** Transactional email via Resend HTTP API; empty = email is a no-op. */
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().default(""),

    /**
     * Optional error sink (JSON POST) for a collector. For full Sentry, install
     * @sentry/nextjs and follow the Phase-1 runbook; this is the dependency-free
     * fallback so errors can reach *somewhere* out of the box.
     */
    ERROR_WEBHOOK_URL: z.string().default(""),
    /**
     * HMAC key for short-lived print tokens (headless PDF rendering).
     * Must be set in prod: the dev default is public and forgeable.
     */
    PRINT_TOKEN_SECRET: z.string().default("dev-insecure-print-secret"),
  })
  .superRefine((v, ctx) => {
    if (v.AUTH_MODE === "clerk") {
      if (!v.CLERK_SECRET_KEY)
        ctx.addIssue({ code: "custom", path: ["CLERK_SECRET_KEY"], message: "required when AUTH_MODE=clerk" });
      if (!v.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
        ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"], message: "required when AUTH_MODE=clerk" });
    }
    // A forgeable print token would let anyone render an invoice PDF (pricing data).
    // Treat AUTH_MODE=clerk as "this is production".
    if (v.AUTH_MODE === "clerk") {
      if (v.PRINT_TOKEN_SECRET === "dev-insecure-print-secret" || v.PRINT_TOKEN_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["PRINT_TOKEN_SECRET"],
          message: "must be a unique random string of >=32 chars when AUTH_MODE=clerk",
        });
      }
    }
    if (v.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET"] as const) {
        if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when STORAGE_DRIVER=s3" });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\n\nFix your .env (see .env.example).`);
}

const e = parsed.data;

/** Camel-cased accessors (stable API used across the app). */
export const env = {
  databaseUrl: e.DATABASE_URL,

  authMode: e.AUTH_MODE,
  devRole: e.DEV_ROLE,
  clerkPublishableKey: e.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  clerkSecretKey: e.CLERK_SECRET_KEY ?? "",
  clerkWebhookSecret: e.CLERK_WEBHOOK_SECRET ?? "",

  storageDriver: e.STORAGE_DRIVER,
  s3Endpoint: e.S3_ENDPOINT ?? "",
  s3Region: e.S3_REGION,
  s3AccessKey: e.S3_ACCESS_KEY ?? "",
  s3SecretKey: e.S3_SECRET_KEY ?? "",
  s3Bucket: e.S3_BUCKET ?? "",
  s3PublicUrl: e.S3_PUBLIC_URL ?? "",
  maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,

  companyId: e.DEFAULT_COMPANY_ID,
  companyGstin: e.COMPANY_GSTIN,
  companyStateCode: e.COMPANY_STATE_CODE,
  invoicePrefix: e.INVOICE_PREFIX,
  orderPrefix: e.ORDER_PREFIX,
  proposalPrefix: e.PROPOSAL_PREFIX,
  poPrefix: e.PO_PREFIX,
  amcPrefix: e.AMC_PREFIX,
  ticketPrefix: e.TICKET_PREFIX,
  grnPrefix: e.GRN_PREFIX,

  autoApproveLimit: e.AUTO_APPROVE_LIMIT,
  minMarginPct: e.MIN_MARGIN_PCT,

  appUrl: e.NEXT_PUBLIC_APP_URL,
  anthropicApiKey: e.ANTHROPIC_API_KEY,
  anthropicModel: e.ANTHROPIC_MODEL,
  cronKey: e.CRON_KEY,
  whatsappWebhookUrl: e.WHATSAPP_WEBHOOK_URL,
  whatsappToken: e.WHATSAPP_TOKEN,
  whatsappPhoneId: e.WHATSAPP_PHONE_ID,
  whatsappVerifyToken: e.WHATSAPP_VERIFY_TOKEN,
  whatsappAppSecret: e.WHATSAPP_APP_SECRET,
  resendApiKey: e.RESEND_API_KEY,
  emailFrom: e.EMAIL_FROM,
  errorWebhookUrl: e.ERROR_WEBHOOK_URL,
  printTokenSecret: e.PRINT_TOKEN_SECRET,
} as const;

export const DEV_ADMIN_ID = "dev-admin";
export const DEV_EMPLOYEE_ID = "dev-employee";
