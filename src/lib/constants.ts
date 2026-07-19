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
export const TECHNOLOGIES = ["MBBR", "SBR", "MBR", "ASP", "SAFF", "DAF"] as const;

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

/**
 * Per-technology "how it works" explainer — generic engineering content that's the
 * same for every deal using that technology, so it's a lookup rather than something
 * the AI re-writes from scratch each time (matches the client's real proposals,
 * which reuse near-identical technology write-ups across different customers).
 * Used as the template-fallback content; the AI path can still elaborate on it.
 */
export const TECHNOLOGY_EXPLAINERS: Record<string, string> = {
  MBBR: "Moving Bed Biofilm Reactor (MBBR) technology uses free-floating plastic biomedia inside the aeration tank, giving bacteria a large protected surface area to grow on. This biofilm breaks down organic pollutants continuously, and because the media itself is retained by a screen at the tank outlet, MBBR handles load fluctuations well with a smaller footprint than conventional activated sludge systems.",
  SBR: "A Sequencing Batch Reactor (SBR) treats wastewater in a single tank through a repeating cycle: Fill, React (aeration), Settle, Decant, and Idle. Because every stage happens in the same tank at a different time rather than in separate tanks, an SBR needs less civil space and gives tighter control over each treatment phase — particularly useful where land is limited.",
  MBR: "A Membrane Bioreactor (MBR) combines biological treatment with ultrafiltration membranes in place of a conventional secondary clarifier. The membranes physically block suspended solids and most pathogens, producing a consistently high-quality, reusable-grade permeate even when the incoming load varies — at a smaller footprint than clarifier-based systems.",
  ASP: "The Activated Sludge Process (ASP) aerates wastewater together with a culture of micro-organisms (activated sludge) that consume dissolved organic matter, then settles and separates the treated water from the biomass in a secondary clarifier. It's a proven, well-understood process with decades of field history across municipal and industrial plants of every scale.",
  SAFF: "A Submerged Aerated Fixed Film (SAFF) reactor passes wastewater through a fixed bed of static media that stays permanently submerged and aerated. The attached biofilm treats the effluent as it flows through, needing no sludge return line and tolerating load swings gracefully — a robust, low-maintenance choice for sites without continuous skilled operator attention.",
  DAF: "Dissolved Air Flotation (DAF) saturates a recycled portion of the clarified effluent with compressed air, then releases it through a pressure-reduction valve at the front of the flotation tank. This forms a cloud of fine micro-bubbles that attach to suspended oil, grease, and fine solids, lifting them to the surface as a froth layer that a skimmer continuously removes — an effective policing step for oil/grease-laden waste streams, typically installed downstream of a gravity oil-and-grease trap.",
};

/**
 * Standard proposal Terms & Conditions — the default seeded into
 * Company.standardTermsTemplate the first time a company edits it, and copied into
 * every new proposal's `terms` field at creation. Generalised from the client's own
 * real proposal documents (warranty/force-majeure/commissioning boilerplate that
 * repeats near-verbatim across their real quotes) — editable per-company in Settings
 * and per-proposal in the editor; neither copy is locked.
 */
export const DEFAULT_STANDARD_TERMS = `Taxes & Duties:
All taxes for the works need to be paid as per the law, along with the payment. Insurance to be covered by the client. No extra charges are levied for Packing & Forwarding and Freight & Handling beyond what is quoted.

Please Note:
• All payments shall be made by cheque/NEFT/RTGS within 15 days of submission of invoices.
• A detailed invoicing breakup will be furnished within 15 days from the date of award of contract.
• If commissioning is delayed beyond 30 days from our notification that the plant is ready, through no fault of ours, the final payment milestone shall be released immediately thereafter.

Force Majeure:
If at any time the execution of this order is affected by war, hostilities, invasion, act of foreign enemies, civil war, rebellion, riots, civil commotion, or acts of God such as earthquake or floods which could not reasonably have been foreseen or insured against, an extension of time as warranted by the circumstances shall be granted without liability on either side.

Warranty:
The equipment is covered by our warranty for a period of twelve months from the date of commissioning. This warranty does not cover damage arising from an unreliable power supply or the absence of proper maintenance.

Commissioning & Guarantee Runs:
One of our technicians will be available to commission the plant and carry out the guarantee tests. Operating staff, labour, consumables, and other utilities are to be provided by the client, free of cost.

Acceptance, Commissioning and Take-Over:
On completion of erection of all quoted equipment, we shall inform the client in writing that we are ready to conduct acceptance tests. On successful completion, any defects observed shall be rectified to the client's satisfaction. Commissioning is deemed complete once the plant is observed over 72 continuous hours achieving the guaranteed performance, after which the client shall issue the Final Acceptance Certificate and take over the plant.

Scope of Work by Green Ecocare:
• Process design based on the operating data and parameters provided.
• Supply of civil drawings within 10 days of the purchase order and advance.
• Supply of mechanical, electrical, and biological components within the agreed lead time, delivered as a single consignment.
• Providing plumbing, cabling, and connections inside and around the plant (installation scope).
• Erection and commissioning within the agreed period after civil works are complete.
• Thorough training for the client's operating staff.
• All equipment carries a one-year warranty from the date of commissioning.

Client Scope:
• Civil works for all RCC tanks (bar screen chamber, equalization tank, aeration tank, pre-filtration tank, sludge digester, sludge drying bed, treated water tank, and pump room), including any required trenches and core-cutting.
• Water-proofing of all tanks and provision of MS/FRP manhole covers.
• Cleaning of all tanks after civil works are complete.
• Connection of the final sewer line from the building to the plant.
• Incoming power cable of the specified size to the pump room, and lighting/water at site during installation.
• Maintenance of the plant with client manpower from the date of commissioning.
• Obtaining plant-related government/statutory approvals.
• Disposal of treated water from the plant to the endpoint.
• 24-hour power supply to the plant from the date of commissioning.`;

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
