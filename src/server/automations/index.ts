import { register } from "./engine";
import { followupDigest } from "./followup-digest";
import { autoNextFollowup } from "./auto-next-followup";
import { staleDealNudge } from "./stale-deal-nudge";
import { paymentReminders } from "./payment-reminders";
import { stageMilestoneTrigger } from "./stage-milestone-trigger";
import { monthlyReceivables } from "./monthly-receivables";
import { dailySiteDigest } from "./daily-site-digest";
import { budgetAlerts } from "./budget-alerts";
import { delayDetection } from "./delay-detection";
import { billVerificationAssist } from "./bill-verification-assist";

/**
 * Registers every automation into the engine. Idempotent — safe to call on each
 * cron request / import. New automations are added here as each wave lands.
 * Event-driven ones (A2/A5/…) register a stub so they appear in Settings with a kill
 * switch, but are actually fired from their service (lead.ts / order.ts).
 */
let registered = false;
export function registerAll(): void {
  if (registered) return;
  register(followupDigest); // A1
  register(autoNextFollowup); // A2 (event-driven stub)
  register(staleDealNudge); // A3
  register(paymentReminders); // A4
  register(stageMilestoneTrigger); // A5 (event-driven stub)
  register(monthlyReceivables); // A6
  register(dailySiteDigest); // A7
  register(budgetAlerts); // A8
  register(delayDetection); // A9
  register(billVerificationAssist); // A10 (event-driven stub)
  registered = true;
}

export { runAutomation, getAutomation, allAutomations, scheduledNames } from "./engine";
export type { AutomationContext, AutomationResult } from "./types";
