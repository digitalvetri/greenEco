import { env } from "./env";
import {
  KLD_BOQ_TEMPLATES,
  DEFAULT_PAYMENT_TERMS,
  nearestKldBand,
  TERMS_LIBRARY,
} from "./constants";

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

export interface AiProposalDraft {
  technicalText: string;
  boqItems: AiBoqLine[];
  scopeOfWork: {
    civil: string;
    mechanical: string;
    electrical: string;
    commissioning: string;
    exclusions: string;
  };
  paymentTerms: Array<{ description: string; percent: number; trigger: string }>;
  source: "claude" | "template";
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

const MODEL = env.anthropicModel;

export async function generateProposalDraft(input: AiProposalInput): Promise<AiProposalDraft> {
  if (!env.anthropicApiKey) {
    return templateDraft(input);
  }
  try {
    return await claudeDraft(input);
  } catch (e) {
    console.error("AI generation failed, falling back to template:", e);
    return templateDraft(input);
  }
}

function templateDraft(input: AiProposalInput): AiProposalDraft {
  const kld = input.capacityKLD || 20;
  const band = nearestKldBand(kld);
  const scale = kld / band;
  const tech = input.technology || "MBBR";
  const plant = input.plantType || "STP";

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

Design basis: The plant is designed to treat ${kld} KLD of ${plant === "ETP" ? "industrial effluent" : "domestic sewage"} to meet TNPCB discharge norms (BOD < 10 mg/l, COD < 50 mg/l, TSS < 10 mg/l). Treatment stages: preliminary screening & oil-grease removal, equalization, biological treatment (${tech}), secondary clarification, tertiary filtration (pressure sand + activated carbon), and disinfection. Treated water is suitable for gardening, flushing, and reuse.

${input.description}`;

  return {
    technicalText,
    boqItems,
    scopeOfWork: {
      civil: "RCC tanks, foundations, and civil structures as per approved GA drawings.",
      mechanical: `${tech} media, blowers, pumps, piping, and mechanical equipment.`,
      electrical: "Control panel, wiring, level controls, and instrumentation.",
      commissioning: "Trial run, performance guarantee test, and operator training.",
      exclusions: "Civil foundation, water & power at site, statutory fees (at actuals).",
    },
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    source: "template",
  };
}

async function claudeDraft(input: AiProposalInput): Promise<AiProposalDraft> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const system = `You are a wastewater treatment proposal engineer for Green Ecocare (Coimbatore, Tamil Nadu, India). You produce technical write-ups and KLD-scaled Bills of Quantity (BOQ) for STP/ETP/WTP plants that meet TNPCB discharge norms. Respond with STRICT JSON only — no markdown, no prose outside the JSON object. Rates are in INR. Keep BOQ realistic for the Indian market.`;

  const user = `Generate a treatment plant proposal draft as JSON with this exact shape:
{
  "technicalText": "process description, design basis, treatment stages, TNPCB-norm outcome language",
  "boqItems": [{"category":"Civil|Piping|PumpsBlowers|Media|Electrical|Others","item":"...","specification":"...","unit":"...","qty":number,"rate":number,"amount":number}],
  "scopeOfWork": {"civil":"...","mechanical":"...","electrical":"...","commissioning":"...","exclusions":"..."},
  "paymentTerms": [{"description":"...","percent":number,"trigger":"DATE|STAGE_COMPLETION"}]
}

Requirement: ${input.description}
Plant type: ${input.plantType || "STP"}
Technology: ${input.technology || "MBBR"}
Capacity: ${input.capacityKLD || "unspecified"} KLD${input.budgetHint ? `\nBudget hint: ₹${input.budgetHint}` : ""}
${input.pastWon ? `\nFor reference, here are this company's past WON proposals in a similar capacity band — align pricing and scope with these:\n${input.pastWon}` : ""}

Ensure amount = qty * rate for each BOQ line. Payment percents must sum to 100.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } } as never,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content.map((b) => ("text" in b ? b.text : "")).join("");

  const parsed = parseDefensively(text);
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

  return {
    technicalText: String(parsed.technicalText ?? ""),
    boqItems,
    scopeOfWork:
      (parsed.scopeOfWork as AiProposalDraft["scopeOfWork"]) ?? templateDraft(input).scopeOfWork,
    paymentTerms:
      (parsed.paymentTerms as AiProposalDraft["paymentTerms"]) ?? DEFAULT_PAYMENT_TERMS,
    source: "claude",
  };
}

/** Strip markdown fences and parse; throw on failure so the caller can fall back. */
function parseDefensively(text: string): Record<string, unknown> {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["technicalText", "boqItems", "scopeOfWork", "paymentTerms"],
  properties: {
    technicalText: { type: "string" },
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

export { TERMS_LIBRARY };
