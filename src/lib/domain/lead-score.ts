/**
 * Deterministic lead temperature (spec §7.1). A weighted sum across five signals,
 * each defensible in one line, mapped to HOT / WARM / COLD. Pure + unit-tested —
 * not a black box. HOT/WARM/COLD is not pricing, so it's visible to all roles.
 *
 * Weights (max ~100):
 *   capacity   ≤30 — a bigger plant (KLD) is a bigger deal
 *   budget     ≤30 — a higher stated budget band is closer to buying
 *   timeline   ≤20 — a sooner decision is hotter
 *   engagement ≤20 — the latest follow-up outcome (price talk > interest > silence)
 *   source      ≤5 — channel partners (consultant/builder/reference) convert better
 */
export type LeadTemperature = "HOT" | "WARM" | "COLD";

export interface LeadScoreInput {
  capacityKLD?: number | null;
  budgetBand?: string | null;
  decisionTimeline?: string | null;
  source: string;
  latestOutcome?: string | null;
}

export interface LeadScoreResult {
  score: number;
  temperature: LeadTemperature;
}

const BUDGET_POINTS: Record<string, number> = {
  "Above ₹1Cr": 30,
  "₹40L–1Cr": 25,
  "₹15–40L": 18,
  "₹5–15L": 10,
  "Under ₹5L": 4,
};

const TIMELINE_POINTS: Record<string, number> = {
  "Immediate (<1 mo)": 20,
  "1–3 months": 15,
  "3–6 months": 8,
  "6+ months": 3,
  Exploratory: 1,
};

const OUTCOME_POINTS: Record<string, number> = {
  PRICE_DISCUSSION: 20,
  INTERESTED: 15,
  NEEDS_TIME: 8,
  NOT_REACHABLE: 2,
  NEGATIVE: 0,
};

export function leadScore(i: LeadScoreInput): LeadScoreResult {
  let s = 0;

  const k = i.capacityKLD ?? 0;
  s += k >= 100 ? 30 : k >= 40 ? 22 : k >= 20 ? 15 : k >= 10 ? 8 : k > 0 ? 4 : 0;

  s += BUDGET_POINTS[i.budgetBand ?? ""] ?? 0;
  s += TIMELINE_POINTS[i.decisionTimeline ?? ""] ?? 0;
  // No follow-up yet → neutral 5; an explicit NEGATIVE outcome scores 0.
  s += i.latestOutcome && i.latestOutcome in OUTCOME_POINTS ? OUTCOME_POINTS[i.latestOutcome] : 5;
  s += i.source === "Consultant" || i.source === "Builder" ? 5 : i.source === "Reference" ? 4 : 2;

  const temperature: LeadTemperature = s >= 60 ? "HOT" : s >= 30 ? "WARM" : "COLD";
  return { score: s, temperature };
}
