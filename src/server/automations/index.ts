import { register } from "./engine";
import { followupDigest } from "./followup-digest";

/**
 * Registers every automation into the engine. Idempotent — safe to call on each
 * cron request / import. New automations are added here as each wave lands.
 */
let registered = false;
export function registerAll(): void {
  if (registered) return;
  register(followupDigest); // A1
  registered = true;
}

export { runAutomation, getAutomation, allAutomations, scheduledNames } from "./engine";
export type { AutomationContext, AutomationResult } from "./types";
