/** Automation Engine core types (AUTOMATION-ENGINE-SPEC §1.2). */

export interface AutomationContext {
  companyId: string;
  now: Date;
  dryRun?: boolean;
}

export interface AutomationResult {
  name: string;
  sent: number;
  skipped: number;
  details: unknown;
}

export type Channel = "WHATSAPP" | "PUSH" | "EMAIL" | "INAPP" | "NONE";

export interface Automation {
  /** Spec id, e.g. "A4" — drives the "<id>.enabled" kill switch. */
  id: string;
  /** Registry key, e.g. "payment-reminders" — 1:1 with /api/cron?job=<name>. */
  name: string;
  /** Human label for the Settings → Automations table. */
  label: string;
  /** Event-driven automations have no schedule; scheduled ones list their IST cadence. */
  schedule?: string;
  run(ctx: AutomationContext): Promise<AutomationResult>;
}
