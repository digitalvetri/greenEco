import { getSetting, isEnabled } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A2 · Auto next-follow-up suggestion (event-driven, AUTOMATION-ENGINE-SPEC §3 A2).
 * Maps a follow-up outcome → a suggested gap so an open lead never loses its next
 * touch. Gaps are editable via AutomationSetting "A2.gaps".
 */
export const A2_DEFAULT_GAPS: Record<string, number> = {
  NEEDS_TIME: 7,
  PRICE_DISCUSSION: 3,
  NOT_REACHABLE: 1,
  INTERESTED: 2,
  NEGATIVE: 0,
};

/** Suggested next-follow-up date, or null (A2 disabled / no outcome / zero-gap outcome). */
export async function suggestNextFollowUpDate(
  companyId: string,
  outcome: string | null | undefined,
  now: Date,
): Promise<Date | null> {
  if (!outcome) return null;
  if (!(await isEnabled(companyId, "A2"))) return null;
  const gaps = await getSetting<Record<string, number>>(companyId, "A2.gaps", A2_DEFAULT_GAPS);
  const days = gaps[outcome] ?? A2_DEFAULT_GAPS[outcome] ?? 0;
  if (days <= 0) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

/** Registry stub — event-driven (called from lead.ts); present for the kill switch + Settings row. */
async function run(_ctx: AutomationContext): Promise<AutomationResult> {
  return { name: "auto-next-followup", sent: 0, skipped: 0, details: { eventDriven: "fires on follow-up create when no next date is set" } };
}

export const autoNextFollowup: Automation = {
  id: "A2",
  name: "auto-next-followup",
  label: "Auto next-follow-up suggestion",
  run,
};
