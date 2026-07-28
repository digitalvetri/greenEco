import {
  KLD_BOQ_TEMPLATES,
  DEFAULT_PAYMENT_TERMS,
  nearestKldBand,
  TECHNOLOGY_EXPLAINERS,
} from "./constants";
import { loadConfig } from "./runtime-config";
import { llmJson } from "./llm";

/**
 * AI proposal generator (spec §7.2). Uses the Claude API when ANTHROPIC_API_KEY
 * is set; otherwise falls back to the seeded KLD-band template library so the
 * feature works offline. Output is ALWAYS parsed defensively and every BOQ line
 * is flagged aiSuggested=true → orange "review" badge until edited/confirmed.
 * Nothing here is auto-sent — admin approval is a separate gate.
 */

export interface AiBoqLine {
  category: string;
  item: string;
  specification?: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  aiSuggested: true;
}

export interface AiTechnicalSpecLine {
  section: string;
  item: string;
  spec: string;
  qty: string;
}

export interface AiElectricalLoadLine {
  description: string;
  hp: number;
}

export interface AiProposalDraft {
  coverLetter: string;
  technicalText: string;
  pointsToNote: string;
  technologyExplainer: string;
  boqItems: AiBoqLine[];
  scopeOfWork: {
    civil: string;
    mechanical: string;
    electrical: string;
    commissioning: string;
    exclusions: string;
  };
  technicalSpecs: AiTechnicalSpecLine[];
  electricalLoad: AiElectricalLoadLine[];
  paymentTerms: Array<{ description: string; percent: number; trigger: string }>;
  source: "claude" | "groq" | "gemini" | "template";
}

export interface AiProposalInput {
  description: string;
  capacityKLD?: number;
  technology?: string;
  plantType?: string;
  budgetHint?: number;
  /** Learning loop (spec §7.2): compact summaries of this company's past WON
   *  proposals in a similar KLD band, used as retrieval few-shot context. */
  pastWon?: string;
}

export async function generateProposalDraft(input: AiProposalInput): Promise<AiProposalDraft> {
  const cfg = await loadConfig();
  // Anthropic first when configured — it has a real json_schema structured-output path.
  if (cfg.ANTHROPIC_API_KEY) {
    try {
      return await claudeDraft(input, cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL);
    } catch (e) {
      console.error("Claude generation failed, trying other providers / template:", e);
    }
  }
  // Groq / Gemini text path (prompt-based JSON). Makes a Groq-only or Gemini-only setup
  // produce AI drafts instead of templates. Null on no-provider OR unparseable → template.
  try {
    const ai = await llmDraft(input);
    if (ai) return ai;
  } catch (e) {
    console.error("LLM generation failed, falling back to template:", e);
  }
  return templateDraft(input);
}

/** Provider-agnostic draft via the llm layer (Groq/Gemini). Defensive — returns null on
 *  any missing provider or output we can't turn into a usable BOQ, so the caller templates. */
async function llmDraft(input: AiProposalInput): Promise<AiProposalDraft | null> {
  const system = `You are a wastewater treatment proposal engineer for Green Ecocare (Coimbatore, Tamil Nadu, India). You produce technical write-ups and KLD-scaled Bills of Quantity (BOQ) for STP/ETP/WTP plants that meet TNPCB discharge norms. Rates are in INR; keep the BOQ realistic for the Indian market.`;
  const user = draftPrompt(input);
  const res = await llmJson<Record<string, unknown>>(system, user, { maxTokens: 6000 });
  if (!res) return null;
  const draft = mapDraft(res.data, input, res.provider === "gemini" ? "gemini" : "groq");
  // Guard: an empty BOQ is not a usable draft — fall back to the template instead.
  return draft.boqItems.length > 0 ? draft : null;
}

/** Realistic per-technology design parameters — used to make the template write-up read
 *  as genuinely engineered (specific HRT/MLSS/loading figures) rather than generic prose,
 *  since this is the deterministic baseline every proposal gets when no AI key is active
 *  or a live call fails. Figures are typical Indian-practice ranges for municipal/domestic
 *  sewage at this scale, not project-specific lab data. */
const TECH_DESIGN_PARAMS: Record<string, { hrt: string; mlss: string; fm: string; aeration: string; sludgeAge: string }> = {
  MBBR: { hrt: "4–6 hours", mlss: "N/A (biofilm-attached, not suspended)", fm: "0.15–0.3 kg BOD/kg biofilm/day", aeration: "1.2–1.5 m³ air/m³ tank/hour", sludgeAge: "N/A — media retained by outlet screens" },
  SBR: { hrt: "8–12 hours (per cycle: fill-react-settle-decant-idle)", mlss: "3,000–4,500 mg/l", fm: "0.1–0.2 kg BOD/kg MLSS/day", aeration: "1.0–1.3 m³ air/m³ tank/hour", sludgeAge: "15–25 days" },
  MBR: { hrt: "5–8 hours", mlss: "6,000–10,000 mg/l (membrane tank)", fm: "0.05–0.15 kg BOD/kg MLSS/day", aeration: "1.5–2.0 m³ air/m³ tank/hour (incl. membrane scouring)", sludgeAge: "20–30 days" },
  ASP: { hrt: "6–8 hours", mlss: "2,500–3,500 mg/l", fm: "0.2–0.4 kg BOD/kg MLSS/day", aeration: "1.0–1.2 m³ air/m³ tank/hour", sludgeAge: "8–15 days" },
  SAFF: { hrt: "4–6 hours", mlss: "N/A (fixed film)", fm: "0.15–0.25 kg BOD/kg media/day", aeration: "1.1–1.4 m³ air/m³ tank/hour", sludgeAge: "N/A — no sludge return line" },
  DAF: { hrt: "0.5–1 hour (flotation cell only)", mlss: "N/A", fm: "N/A", aeration: "N/A (air dissolved under pressure, not diffused)", sludgeAge: "N/A" },
};

function templateDraft(input: AiProposalInput): AiProposalDraft {
  const kld = input.capacityKLD || 20;
  const band = nearestKldBand(kld);
  const scale = kld / band;
  const tech = input.technology || "MBBR";
  const plant = input.plantType || "STP";
  const isEffluent = plant === "ETP";
  const params = TECH_DESIGN_PARAMS[tech] ?? TECH_DESIGN_PARAMS.MBBR;

  const boqItems: AiBoqLine[] = KLD_BOQ_TEMPLATES[band].map((l) => {
    const qty = Math.round(l.qty * scale * 1000) / 1000;
    const amount = Math.round(qty * l.rate * 100) / 100;
    return {
      category: l.category,
      item: l.item,
      specification: l.specification,
      unit: l.unit,
      qty,
      rate: l.rate,
      amount,
      aiSuggested: true,
    };
  });

  const technicalText = `Proposed ${plant} of ${kld} KLD capacity based on ${tech} technology.

Design basis: The plant is designed to treat ${kld} KLD of ${isEffluent ? "industrial effluent" : "domestic sewage"} to meet TNPCB discharge norms (BOD < 10 mg/l, COD < 50 mg/l, TSS < 10 mg/l, pH 6.5–8.5). Key design parameters for the ${tech} process at this scale: Hydraulic Retention Time ${params.hrt}; MLSS ${params.mlss}; F/M ratio ${params.fm}; diffused aeration rate ${params.aeration}; sludge age ${params.sludgeAge}. These are sized to absorb normal load variation from ${isEffluent ? "batch discharge patterns" : "peak morning/evening occupancy"} without upsetting biological stability.

Process flow — the plant is built as a sequence of discrete, independently-serviceable stages so any one stage can be inspected or maintained without shutting down the whole line:
1. Preliminary treatment — bar screen (removes rags/solids ≥6mm) followed by an oil & grease trap, protecting downstream pumps and media from clogging.
2. Equalization tank — buffers flow and load fluctuations over the day so the biological stage always sees a steady, predictable feed; fitted with a submersible transfer pump and level controls.
3. Biological treatment (${tech}) — the core stage; ${TECHNOLOGY_EXPLAINERS[tech] ? "see the technology explainer below for how it specifically works" : "aerobic bacteria break down dissolved and suspended organic matter"}.
4. Secondary clarification — settles/separates any residual biomass from the treated stream ahead of polishing.
5. Tertiary filtration — pressure sand filter (removes residual suspended solids) followed by activated carbon filter (removes colour, odour, and residual organics) for a visually clear, low-odour final effluent.
6. Disinfection — chlorine/UV dosing (as specified) to meet bacteriological discharge/reuse norms before final disposal or reuse.

Expected treated water quality meets TNPCB norms for ${isEffluent ? "trade effluent discharge" : "on-land disposal, gardening/flushing reuse, or municipal sewer discharge (as applicable)"}. ${input.description}`;

  const coverLetter = `We thank you for the opportunity to work on your ${plant} requirement and for considering us for delivering environmental engineering solutions as per the need envisaged.

With reference to our discussions, we are pleased to place before you a technical, engineering and pricing note for ${kld} KLD capacity using ${tech} technology. This proposal covers the complete scope — civil, mechanical, electrical, and commissioning — along with the design basis, technical specifications, and commercial terms, so you have everything needed to evaluate and finalise the order in one document.

We would request you to kindly go through the proposal and let us have your thoughts, so that we may finalise this for a valued order. Our team remains available for a site visit or a technical discussion at your convenience before you decide.

We look forward to the pleasure of working with you on this technology to solve your wastewater treatment needs.`;

  const pointsToNote = `GST will be 18% extra, as shown in the commercial offer below.
Please let us know the invert level before commencing civil works — if it exceeds 3 feet, a collection tank with an additional transfer pump is recommended (cost extra).
24-hour, 3-phase power back-up is required to operate the plant smoothly; the biological process is sensitive to prolonged aeration outages.
Disposal of non-biodegradable items and waste oil/food into the drainage system should be strictly avoided, as it affects treatment performance and can foul the media/membranes.
Civil work (tanks, foundations, plant room) is to be completed as per our approved GA drawing before mechanical installation begins — any deviation from the GA may affect hydraulic flow and warranty.
Water and power at the site during installation/commissioning are to be provided by the client, free of cost.
A trained operator (ours or yours) should log daily readings (pH, DO, flow, MLSS where applicable) for the first month to establish a stable operating baseline.
Any statutory consent/renewal fees (TNPCB CTE/CTO, etc.) are at actuals and outside this commercial offer unless explicitly listed.`;

  // Reuse the BOQ template's item/specification data (minus pricing) as a starting
  // technical-specifications table — genuinely useful without needing an AI key.
  const technicalSpecs: AiTechnicalSpecLine[] = KLD_BOQ_TEMPLATES[band].map((l) => ({
    section: l.category,
    item: l.item,
    spec: l.specification ?? "—",
    qty: `${Math.round(l.qty * scale * 1000) / 1000} ${l.unit}`,
  }));

  // Opportunistically parse "<N> HP" out of item names already in the BOQ template
  // (e.g. "Air Blower 2HP") — a real, non-empty electrical-load starting point.
  const electricalLoad: AiElectricalLoadLine[] = KLD_BOQ_TEMPLATES[band]
    .map((l) => {
      const m = /(\d+(?:\.\d+)?)\s*HP/i.exec(l.item);
      if (!m) return null;
      const qty = Math.round(l.qty * scale * 1000) / 1000;
      return { description: l.item.replace(/\d+(?:\.\d+)?\s*HP/i, "").trim(), hp: Math.round(Number(m[1]) * qty * 100) / 100 };
    })
    .filter((l): l is AiElectricalLoadLine => l !== null);

  return {
    coverLetter,
    technicalText,
    pointsToNote,
    technologyExplainer: TECHNOLOGY_EXPLAINERS[tech] ?? "",
    boqItems,
    scopeOfWork: {
      civil: "RCC tanks (equalization, aeration/biological, clarifier, filtration as applicable), plant room foundation, and associated civil structures — built as per our approved General Arrangement (GA) drawing, issued before civil work commences.",
      mechanical: `${tech} media/process equipment, air blowers, transfer/dosing pumps, pressure sand filter, activated carbon filter, inter-connecting UPVC/GI piping and valves, and all mechanical equipment listed in the Bill of Quantities.`,
      electrical: "Control panel (starters, MCBs, indication lamps), power and control wiring from panel to each equipment, level controls/float switches for automatic pump operation, and basic instrumentation (pressure gauges, flow indication where specified).",
      commissioning: "Mechanical/electrical installation supervision, trial run with water, biological seeding and stabilisation period, a performance guarantee test against the design parameters above, and hands-on operator training covering daily checks, routine maintenance, and troubleshooting.",
      exclusions: "Civil foundation execution labour (unless explicitly quoted), water & power supply at site during installation/commissioning, statutory consent fees (TNPCB CTE/CTO etc.) at actuals, and any civil/structural work outside the approved GA drawing.",
    },
    technicalSpecs,
    electricalLoad,
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    source: "template",
  };
}

/** Shared proposal-draft prompt (Claude structured path + Groq/Gemini text path). */
export function draftPrompt(input: AiProposalInput): string {
  return `Generate a DETAILED, client-ready treatment plant proposal draft as JSON with this exact shape. This is a real commercial document a client will read before deciding — depth and specificity matter more than brevity. Do not under-write any section below its stated minimum.
{
  "coverLetter": "a confident, warm 3-4 paragraph cover letter introducing this proposal (150-220 words) — no pricing, no client name (we don't have it here). Lead with the client's outcome (compliant discharge, reliable uptime, low running cost), not with our company. Mention that the proposal covers civil/mechanical/electrical/commissioning scope plus technical specs and commercial terms in one document. Avoid generic filler like 'we are pleased to submit' — get to substance fast.",
  "technicalText": "a THOROUGH multi-paragraph technical write-up (400-600 words): (1) a design-basis paragraph with concrete parameters — HRT, MLSS (or 'N/A, biofilm' if attached-growth), F/M ratio, aeration rate, sludge age, expected inlet BOD/COD/TSS if inferable — appropriate to the named technology; (2) a NUMBERED step-by-step process-flow section covering every real stage (preliminary screening/oil-grease trap, equalization, biological treatment, secondary clarification, tertiary filtration, disinfection) with one or two sentences of WHY each stage exists, not just its name; (3) a closing paragraph on expected treated-water quality and its intended use (discharge/reuse/gardening/flushing). Read as engineered, not templated.",
  "pointsToNote": "6-8 short caveats/operational notes specific to this plant type and technology, one per line, no bullet characters. Cover: GST/statutory fees, civil-work dependencies (invert level, GA drawing conformance), power backup requirement, O&M/operator expectations, what happens on non-biodegradable/waste-oil disposal, water/power-at-site during commissioning. These should read as things a genuinely experienced engineer would flag, each with a brief reason — not generic one-line disclaimers.",
  "technologyExplainer": "4-6 sentences explaining how this specific technology works and WHY it's the right fit for this capacity/segment, for a non-technical reader (e.g. a factory owner or facilities manager). Make the case — compare briefly to what a generic/older technology would cost them (space, sludge handling, effluent consistency) — don't just describe the process.",
  "boqItems": [{"category":"Civil|Piping|PumpsBlowers|Media|Electrical|Others","item":"...","specification":"...","unit":"...","qty":number,"rate":number,"amount":number}],
  "scopeOfWork": {"civil":"2-3 sentences naming the actual tanks/structures (equalization, biological, clarifier, filtration as applicable) and that they follow an approved GA drawing.","mechanical":"2-3 sentences naming the actual major equipment implied by the BOQ (blowers, pumps, filters, media, piping).","electrical":"2-3 sentences: panel, wiring scope, level controls/instrumentation.","commissioning":"2-3 sentences: installation supervision, trial run, biological seeding/stabilisation, performance guarantee test, operator training.","exclusions":"2-3 sentences: civil labour (if not quoted), water/power at site, statutory consent fees, anything outside the GA drawing."},
  "technicalSpecs": [{"section":"e.g. Pumps|Blowers|Panel|Tanks|Media|Filtration","item":"component name","spec":"make/model/dimensions/MOC as applicable","qty":"e.g. '2 Nos'"}] — at least 8 rows covering every major BOQ category, not just a couple,
  "electricalLoad": [{"description":"component name","hp":number}],
  "paymentTerms": [{"description":"...","percent":number,"trigger":"DATE|STAGE_COMPLETION"}]
}

Requirement: ${input.description}
Plant type: ${input.plantType || "STP"}
Technology: ${input.technology || "MBBR"}
Capacity: ${input.capacityKLD || "unspecified"} KLD${input.budgetHint ? `\nBudget hint: ₹${input.budgetHint}` : ""}
${input.pastWon ? `\nFor reference, here are this company's past WON proposals in a similar capacity band — align pricing and scope with these:\n${input.pastWon}` : ""}

Ensure amount = qty * rate for each BOQ line. Payment percents must sum to 100. technicalSpecs and electricalLoad should list the actual major components implied by the BOQ (pumps, blowers, panel, media, tanks) — electricalLoad only for components that draw power.

Write like a senior proposal engineer pitching a plant manager who has read other vendors' quotes: specific, confident, and free of boilerplate. Every sentence should say something a competitor's generic template wouldn't. Never invent client names, dates, or commitments not given above.`;
}

/** Map a parsed JSON object (from any provider) into a validated AiProposalDraft. */
export function mapDraft(
  parsed: Record<string, unknown>,
  input: AiProposalInput,
  source: AiProposalDraft["source"],
): AiProposalDraft {
  const rawBoq = (parsed.boqItems as Array<Record<string, unknown>>) ?? [];
  const boqItems: AiBoqLine[] = rawBoq.map((l) => ({
    category: String(l.category ?? "Others"),
    item: String(l.item ?? ""),
    specification: l.specification ? String(l.specification) : undefined,
    unit: String(l.unit ?? "nos"),
    qty: Number(l.qty ?? 0),
    rate: Number(l.rate ?? 0),
    amount: Number(l.amount ?? Number(l.qty ?? 0) * Number(l.rate ?? 0)),
    aiSuggested: true,
  }));

  const rawSpecs = parsed.technicalSpecs as Array<Record<string, unknown>> | undefined;
  const technicalSpecs: AiTechnicalSpecLine[] | undefined = rawSpecs?.map((s) => ({
    section: String(s.section ?? "Others"),
    item: String(s.item ?? ""),
    spec: String(s.spec ?? ""),
    qty: String(s.qty ?? ""),
  }));

  const rawLoad = parsed.electricalLoad as Array<Record<string, unknown>> | undefined;
  const electricalLoad: AiElectricalLoadLine[] | undefined = rawLoad?.map((l) => ({
    description: String(l.description ?? ""),
    hp: Number(l.hp ?? 0),
  }));

  const fallback = templateDraft(input);
  return {
    coverLetter: parsed.coverLetter ? String(parsed.coverLetter) : fallback.coverLetter,
    technicalText: String(parsed.technicalText ?? fallback.technicalText),
    pointsToNote: parsed.pointsToNote ? String(parsed.pointsToNote) : fallback.pointsToNote,
    technologyExplainer: parsed.technologyExplainer ? String(parsed.technologyExplainer) : fallback.technologyExplainer,
    boqItems,
    scopeOfWork: (parsed.scopeOfWork as AiProposalDraft["scopeOfWork"]) ?? fallback.scopeOfWork,
    technicalSpecs: technicalSpecs?.length ? technicalSpecs : fallback.technicalSpecs,
    electricalLoad: electricalLoad?.length ? electricalLoad : fallback.electricalLoad,
    paymentTerms:
      (parsed.paymentTerms as AiProposalDraft["paymentTerms"]) ?? DEFAULT_PAYMENT_TERMS,
    source,
  };
}

async function claudeDraft(input: AiProposalInput, apiKey: string, model: string): Promise<AiProposalDraft> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const system = `You are a senior wastewater treatment proposal engineer at Green Ecocare (Coimbatore, Tamil Nadu, India), writing a client-facing commercial proposal that will be compared against competitors' quotes. You produce persuasive, technically credible write-ups and KLD-scaled Bills of Quantity (BOQ) for STP/ETP/WTP plants that meet TNPCB discharge norms. Write with specificity (real design parameters, real component names) rather than generic filler — this document needs to win the deal, not just describe a plant. Respond with STRICT JSON only — no markdown, no prose outside the JSON object. Rates are in INR. Keep BOQ realistic for the Indian market.`;

  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    system,
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } } as never,
    messages: [{ role: "user", content: draftPrompt(input) }],
  });

  const text = res.content.map((b) => ("text" in b ? b.text : "")).join("");
  return mapDraft(parseDefensively(text), input, "claude");
}

/** Strip markdown fences and parse; throw on failure so the caller can fall back. */
export function parseDefensively(text: string): Record<string, unknown> {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "coverLetter",
    "technicalText",
    "pointsToNote",
    "technologyExplainer",
    "boqItems",
    "scopeOfWork",
    "technicalSpecs",
    "electricalLoad",
    "paymentTerms",
  ],
  properties: {
    coverLetter: { type: "string" },
    technicalText: { type: "string" },
    pointsToNote: { type: "string" },
    technologyExplainer: { type: "string" },
    boqItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "item", "unit", "qty", "rate", "amount"],
        properties: {
          category: { type: "string" },
          item: { type: "string" },
          specification: { type: "string" },
          unit: { type: "string" },
          qty: { type: "number" },
          rate: { type: "number" },
          amount: { type: "number" },
        },
      },
    },
    scopeOfWork: {
      type: "object",
      additionalProperties: false,
      required: ["civil", "mechanical", "electrical", "commissioning", "exclusions"],
      properties: {
        civil: { type: "string" },
        mechanical: { type: "string" },
        electrical: { type: "string" },
        commissioning: { type: "string" },
        exclusions: { type: "string" },
      },
    },
    technicalSpecs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "item", "spec", "qty"],
        properties: {
          section: { type: "string" },
          item: { type: "string" },
          spec: { type: "string" },
          qty: { type: "string" },
        },
      },
    },
    electricalLoad: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "hp"],
        properties: {
          description: { type: "string" },
          hp: { type: "number" },
        },
      },
    },
    paymentTerms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "percent", "trigger"],
        properties: {
          description: { type: "string" },
          percent: { type: "number" },
          trigger: { type: "string" },
        },
      },
    },
  },
} as const;
