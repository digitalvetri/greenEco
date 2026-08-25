import { z } from "zod";

/**
 * PER-TYPE PROPOSAL DOCUMENT DATA — what an admin actually enters for one deal,
 * stored in `ProposalVersion.documentData`.
 *
 * The four proposal types produce genuinely different documents, so they need
 * different fields. Rather than ~15 divergent nullable columns, this is one Json
 * column with a discriminated per-type schema validated here.
 *
 * Every field is optional. A proposal can be created with nothing filled in and
 * completed later — the print template just omits the sections it has no data for,
 * exactly as it already does for the v29 richness fields.
 */

/** §6.1 — the capacity calculation that opens the client's real Project Report. */
export const capacityCalcSchema = z.object({
  /** "Total number of people working in factory all 3 shifts". */
  people: z.number().nonnegative().optional(),
  /** Litres per head per day. */
  usagePerHead: z.number().nonnegative().optional(),
  /** Head-room added on top of the computed sewage generation, in litres. */
  factorOfSafety: z.number().nonnegative().optional(),
  /** Free-text describing the population basis, e.g. "500 people per day, 3 shifts". */
  basis: z.string().trim().max(500).optional(),
});
export type CapacityCalc = z.infer<typeof capacityCalcSchema>;

const parameterRow = z.object({
  parameter: z.string().trim().max(60),
  value: z.string().trim().max(120),
});

const processUnitRow = z.object({
  unit: z.string().trim().max(120),
  body: z.string().trim().max(8000),
});

const equipmentRow = z.object({
  name: z.string().trim().max(200),
  quantity: z.string().trim().max(60),
});

const materialSpecRow = z.object({
  title: z.string().trim().max(200),
  lines: z.array(z.string().trim().max(300)).max(30),
});

/**
 * Project Report — the 15-section engineered document. Every block here starts as a
 * copy of the per-technology template and is then freely editable, so a proposal
 * never silently changes when the template does.
 */
export const projectReportDataSchema = z.object({
  kind: z.literal("PROJECT_REPORT").optional(),
  capacityCalc: capacityCalcSchema.optional(),
  inletParameters: z.array(parameterRow).max(20).optional(),
  outletParameters: z.array(parameterRow).max(20).optional(),
  /** §6.4's closing recommendation, seeded from the technology template. */
  recommendation: z.string().trim().max(4000).optional(),
  /** §6.5's flow-chart nodes, top to bottom. */
  flowChart: z.array(z.string().trim().max(120)).max(40).optional(),
  sludgeBranchAfter: z.string().trim().max(120).optional(),
  dosingBranchAt: z.string().trim().max(120).optional(),
  /** §6.6 per-unit descriptions. */
  processUnits: z.array(processUnitRow).max(30).optional(),
  /** §8.i machinery table. */
  equipment: z.array(equipmentRow).max(60).optional(),
  /** §8.ii materials specification sheet. */
  materialSpecs: z.array(materialSpecRow).max(60).optional(),
  /** §9's factor-of-safety percentage applied to the summed running load. */
  loadFactorOfSafetyPct: z.number().min(0).max(100).optional(),
});
export type ProjectReportData = z.infer<typeof projectReportDataSchema>;

/** BOQ Proposal — an itemised machinery estimate. The lines themselves live in
 *  BOQItem (so totals/GST/milestones are unchanged); this holds only the document's
 *  own framing. */
export const boqProposalDataSchema = z.object({
  kind: z.literal("BOQ").optional(),
  /** The all-caps title line above the table, e.g.
   *  "100000 LITRES PER DAY STP ODDANCHATRAM WOMENS COLLEGE". */
  estimateTitle: z.string().trim().max(300).optional(),
  /** Sub-heading; the sample uses "MECHANICAL, ELECTRICAL AND PLUMBING MATERIAL DETAILS". */
  estimateSubtitle: z.string().trim().max(300).optional(),
});
export type BoqProposalData = z.infer<typeof boqProposalDataSchema>;

/**
 * Service / AMC proposals. The client has NOT supplied sample formats for these two,
 * so their document layout is deliberately not designed. The schema accepts a free-text
 * scope so the type is usable end-to-end today, and gains real fields when the formats
 * arrive — an additive change, not a refactor.
 */
export const genericProposalDataSchema = z.object({
  kind: z.literal("GENERIC").optional(),
  summary: z.string().trim().max(8000).optional(),
});
export type GenericProposalData = z.infer<typeof genericProposalDataSchema>;

export type ProposalDocumentData = ProjectReportData | BoqProposalData | GenericProposalData;

/** Which schema governs a given proposal type. */
export function schemaForType(proposalType: string | null | undefined) {
  switch (proposalType) {
    case "BOQ Proposal":
      return boqProposalDataSchema;
    case "Project Proposal":
      return projectReportDataSchema;
    default:
      return genericProposalDataSchema;
  }
}

/**
 * Validate whatever the client sent against the schema for this proposal's type.
 * Throws on a shape that doesn't fit — the Zod-validate-every-input rule (spec §9).
 */
export function parseDocumentData(proposalType: string | null | undefined, data: unknown) {
  return schemaForType(proposalType).parse(data ?? {});
}

/**
 * Read `documentData` back out as Project Report data. Returns an empty object for a
 * proposal of another type or one saved before this field existed, so the renderer
 * never has to null-check every block.
 */
export function asProjectReportData(data: unknown): ProjectReportData {
  const r = projectReportDataSchema.safeParse(data ?? {});
  return r.success ? r.data : {};
}

export function asBoqProposalData(data: unknown): BoqProposalData {
  const r = boqProposalDataSchema.safeParse(data ?? {});
  return r.success ? r.data : {};
}

// ---------------------------------------------------------------------------
// The capacity calculation (§6.1)
// ---------------------------------------------------------------------------

export interface CapacityCalcResult {
  /** people × usagePerHead */
  sewagePerDay: number;
  /** sewagePerDay + factorOfSafety */
  designCapacityLPD: number;
  /** designCapacityLPD ÷ 1000, rounded to a whole KLD as the samples do. */
  designCapacityKLD: number;
}

/**
 * Reproduces the sample's arithmetic exactly:
 *   500 people × 45 lpd            = 22,500 litres/day
 *   + 7,500 factor of safety       = 30,000 litres/day
 *   ÷ 1000                         ≈ 30 KLD
 *
 * Pure + unit-tested. Returns zeros when the inputs are absent, so a half-filled
 * form renders "—" rather than NaN.
 */
export function computeCapacity(calc: CapacityCalc | undefined): CapacityCalcResult {
  const people = calc?.people ?? 0;
  const usage = calc?.usagePerHead ?? 0;
  const fos = calc?.factorOfSafety ?? 0;
  const sewagePerDay = Math.round(people * usage);
  const designCapacityLPD = sewagePerDay + fos;
  return {
    sewagePerDay,
    designCapacityLPD,
    // The samples round to a whole KLD ("30,000 LPD ≈ 30 KLD").
    designCapacityKLD: Math.round(designCapacityLPD / 1000),
  };
}

// ---------------------------------------------------------------------------
// The electrical load calculation (§9)
// ---------------------------------------------------------------------------

export interface LoadRow {
  description: string;
  hp?: number | null;
  hpPerUnit?: number | null;
  units?: number | null;
  running?: number | null;
  standby?: number | null;
}

export interface LoadTotals {
  units: number;
  running: number;
  standby: number;
  /** Σ running-capacity HP, before the factor of safety. */
  hp: number;
  /** The factor-of-safety addition in HP. */
  factorOfSafetyHp: number;
  /** hp + factorOfSafetyHp — the sample's bottom "Total" row. */
  totalHp: number;
  /** totalHp rounded to a whole HP — the sample's "capacity required ≈ N HP" line. */
  requiredHp: number;
  /** requiredHp × 0.7457. */
  kw: number;
  /** kw rounded UP to the next half kW — the sample's "Power Supply Required" figure. */
  supplyKw: number;
}

/** 1 HP = 0.7457 kW — the constant printed in the client's own document. */
export const HP_TO_KW = 0.7457;

/**
 * Sums the §9 load table the way the samples do: a factor-of-safety row on top of the
 * running-capacity total, that total rounded to a whole HP, converted to kW, then
 * rounded UP to the next half kW for the incoming-supply figure.
 *
 * Verified against both worked examples in the client's documents:
 *   MBBR — 10.0 HP + 10% = 11.0 → 11 HP → 8.2027 kW → "≈ 8.5 kW"
 *   SBR  — 11.6 HP + 10% = 12.76 → 13 HP → 9.694 kW  → "≈ 10 kW"
 * Hence 2-decimal precision (1.16 / 12.76), not 1.
 *
 * ⚠️ The MBBR sample's printed unit/running totals (10 and 6) do NOT match its own
 * five rows, which sum to 9 and 5 — those are the SBR table's totals left behind in a
 * copy-paste, the same class of slip as its ASP sibling's mis-titled flow chart. This
 * computes honestly from the rows rather than reproducing the error.
 */
export function computeLoadTotals(rows: LoadRow[], fosPct = 10): LoadTotals {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const units = rows.reduce((a, x) => a + (x.units ?? 0), 0);
  const running = rows.reduce((a, x) => a + (x.running ?? 0), 0);
  const standby = rows.reduce((a, x) => a + (x.standby ?? 0), 0);
  const hp = r2(rows.reduce((a, x) => a + (x.hp ?? 0), 0));
  const factorOfSafetyHp = r2((hp * fosPct) / 100);
  const totalHp = r2(hp + factorOfSafetyHp);
  const requiredHp = Math.round(totalHp);
  const kw = r2(requiredHp * HP_TO_KW);
  return {
    units,
    running,
    standby,
    hp,
    factorOfSafetyHp,
    totalHp,
    requiredHp,
    kw,
    supplyKw: Math.ceil(kw * 2) / 2,
  };
}
