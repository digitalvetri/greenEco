/** Seed/template constants (spec §7.3, §10). Editable per project at runtime. */

/** Default 9-stage execution template (spec §7.3). */
export const DEFAULT_STAGES: string[] = [
  "Site Survey & Marking",
  "Excavation",
  "Civil Works — Tank Construction",
  "Curing & Hydro Test",
  "Piping & Plumbing",
  "Equipment Installation",
  "Electrical & Control Panel",
  "Trial Run & Commissioning",
  "Handover & Documentation",
];

export const LEAD_SOURCES = [
  "Reference",
  "SiteVisit",
  "CallIn",
  "Builder",
  "Consultant",
  "Other",
] as const;

export const ITEM_CATEGORIES = [
  "Plumbing",
  "Civil",
  "PumpsMotors",
  "Blowers",
  "Electrical",
  "MediaConsumables",
  "Tools",
] as const;

/** Human-friendly labels for the camelCase item/vendor category keys. */
export const CATEGORY_LABELS: Record<string, string> = {
  Plumbing: "Plumbing",
  Civil: "Civil",
  PumpsMotors: "Pumps & Motors",
  Blowers: "Blowers",
  Electrical: "Electrical",
  MediaConsumables: "Media & Consumables",
  Tools: "Tools",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export const BOQ_CATEGORIES = [
  "Civil",
  "Piping",
  "PumpsBlowers",
  "Media",
  "Electrical",
  "Others",
] as const;

export const BOQ_UNITS = [
  "Nos", "Cum", "Sq.m", "Rmt", "Kg", "Ton", "Lot", "Set", "Pair", "Litre", "m³", "m²",
] as const;

export const PLANT_TYPES = ["STP", "ETP", "WTP"] as const;
export const TECHNOLOGIES = ["MBBR", "SBR", "MBR", "ASP", "SAFF"] as const;

/** Industry segment taxonomy (spec §7.1) — drives segment-level pipeline analytics. */
export const SEGMENTS = [
  "Apartment",
  "Villa/Gated",
  "Textile",
  "Hospital",
  "Hotel",
  "ITPark",
  "Industrial",
  "Municipal",
  "Institution",
] as const;

/** Indicative budget bands (₹). */
export const BUDGET_BANDS = [
  "Under ₹5L",
  "₹5–15L",
  "₹15–40L",
  "₹40L–1Cr",
  "Above ₹1Cr",
] as const;

/** Expected decision timeframe. */
export const DECISION_TIMELINES = [
  "Immediate (<1 mo)",
  "1–3 months",
  "3–6 months",
  "6+ months",
  "Exploratory",
] as const;

/** Structured lost-reason picklist (feeds win/loss analytics + the AI loop). */
export const LOST_REASONS = [
  "Price too high",
  "Lost to competitor",
  "Budget dropped",
  "Timeline slipped",
  "No response",
  "Went in-house",
  "Requirement changed",
  "Other",
] as const;

/** Default milestone/payment terms template — 50/30/20 (confirm with client, spec §11). */
export const DEFAULT_PAYMENT_TERMS = [
  { description: "Advance on order confirmation", percent: 50, trigger: "DATE" },
  { description: "On equipment delivery to site", percent: 30, trigger: "STAGE_COMPLETION" },
  { description: "On commissioning & handover", percent: 20, trigger: "STAGE_COMPLETION" },
];

/** T&C clause library (starter). */
export const TERMS_LIBRARY = [
  "Prices are exclusive of GST which shall be charged extra as applicable.",
  "Validity of this proposal is 30 days from the date of issue.",
  "Civil foundation, water, and power at site to be provided by the client.",
  "Delivery period: 8–12 weeks from receipt of advance and approved drawings.",
  "Any statutory approvals (TNPCB/CGWA) assistance provided; fees at actuals.",
  "Payment terms as per the agreed milestone schedule.",
];

/** KLD-band BOQ template library (starter sets, spec §10). */
export interface BoqTemplateLine {
  category: string;
  item: string;
  specification?: string;
  unit: string;
  qty: number;
  rate: number;
}

export const KLD_BOQ_TEMPLATES: Record<number, BoqTemplateLine[]> = {
  10: [
    { category: "Civil", item: "RCC Tank (M25)", unit: "cum", qty: 25, rate: 9500 },
    { category: "PumpsBlowers", item: "Air Blower 2HP", unit: "nos", qty: 2, rate: 42000 },
    { category: "Media", item: "MBBR Media", specification: "K1", unit: "cum", qty: 3, rate: 32000 },
    { category: "Piping", item: "UPVC Piping & Fittings", unit: "lot", qty: 1, rate: 45000 },
    { category: "Electrical", item: "Control Panel + Wiring", unit: "lot", qty: 1, rate: 60000 },
  ],
  20: [
    { category: "Civil", item: "RCC Tank (M25)", unit: "cum", qty: 45, rate: 9500 },
    { category: "PumpsBlowers", item: "Air Blower 3HP", unit: "nos", qty: 2, rate: 55000 },
    { category: "Media", item: "MBBR Media", specification: "K1", unit: "cum", qty: 6, rate: 32000 },
    { category: "Piping", item: "UPVC Piping & Fittings", unit: "lot", qty: 1, rate: 70000 },
    { category: "Electrical", item: "Control Panel + Wiring", unit: "lot", qty: 1, rate: 85000 },
  ],
  40: [
    { category: "Civil", item: "RCC Tank (M25)", unit: "cum", qty: 85, rate: 9500 },
    { category: "PumpsBlowers", item: "Air Blower 5HP", unit: "nos", qty: 2, rate: 78000 },
    { category: "Media", item: "MBBR Media", specification: "K1", unit: "cum", qty: 12, rate: 32000 },
    { category: "Piping", item: "MS/UPVC Piping", unit: "lot", qty: 1, rate: 130000 },
    { category: "Electrical", item: "Control Panel + PLC", unit: "lot", qty: 1, rate: 160000 },
  ],
  60: [
    { category: "Civil", item: "RCC Tank (M25)", unit: "cum", qty: 125, rate: 9500 },
    { category: "PumpsBlowers", item: "Air Blower 7.5HP", unit: "nos", qty: 2, rate: 105000 },
    { category: "Media", item: "MBBR Media", specification: "K1", unit: "cum", qty: 18, rate: 32000 },
    { category: "Piping", item: "MS/UPVC Piping", unit: "lot", qty: 1, rate: 190000 },
    { category: "Electrical", item: "Control Panel + PLC/SCADA", unit: "lot", qty: 1, rate: 240000 },
  ],
  100: [
    { category: "Civil", item: "RCC Tank (M25)", unit: "cum", qty: 210, rate: 9500 },
    { category: "PumpsBlowers", item: "Air Blower 10HP", unit: "nos", qty: 3, rate: 135000 },
    { category: "Media", item: "MBBR Media", specification: "K1", unit: "cum", qty: 30, rate: 32000 },
    { category: "Piping", item: "MS/UPVC Piping", unit: "lot", qty: 1, rate: 320000 },
    { category: "Electrical", item: "Control Panel + SCADA", unit: "lot", qty: 1, rate: 420000 },
  ],
};

/** Pick the nearest KLD band template for a given capacity. */
export function nearestKldBand(kld: number): number {
  const bands = Object.keys(KLD_BOQ_TEMPLATES).map(Number).sort((a, b) => a - b);
  let best = bands[0];
  for (const b of bands) {
    if (Math.abs(b - kld) < Math.abs(best - kld)) best = b;
  }
  return best;
}

/**
 * Indicative *quote* value for a capacity, from the KLD-band template scaled to
 * the actual KLD. These are SELL/quote rates (the same rates that become
 * BOQItem.rate on a proposal — employee-visible), NOT cost. Returned as a ±15%
 * band so it reads as an estimate, never a firm price. Pure + deterministic.
 */
export function boqPreview(kld: number): { band: number; low: number; mid: number; high: number } | null {
  if (!kld || kld <= 0) return null;
  const band = nearestKldBand(kld);
  const scale = kld / band;
  const mid = KLD_BOQ_TEMPLATES[band].reduce((sum, l) => sum + l.qty * scale * l.rate, 0);
  return {
    band,
    low: Math.round(mid * 0.85),
    mid: Math.round(mid),
    high: Math.round(mid * 1.15),
  };
}
