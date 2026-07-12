import { register } from "./engine";
import { followupDigest } from "./followup-digest";
import { staleDealNudge } from "./stale-deal-nudge";

/**
 * Registers every automation into the engine. Idempotent — safe to call on each
 * cron request / import. New automations are added here as each wave lands.
 * (A2 auto-next-followup is event-driven — called from lead.ts, not registered here.)
 */
let registered = false;
export function registerAll(): void {
  if (registered) return;
  register(followupDigest); // A1
  register(staleDealNudge); // A3
  registered = true;
}

export { runAutomation, getAutomation, allAutomations, scheduledNames } from "./engine";
export type { AutomationContext, AutomationResult } from "./types";
