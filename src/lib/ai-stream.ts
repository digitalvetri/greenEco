import { loadConfig } from "./runtime-config";
import { draftPrompt, mapDraft, parseDefensively, DRAFT_SCHEMA, generateProposalDraft, type AiProposalInput, type AiProposalDraft } from "./ai";

/**
 * Streaming variant of generateProposalDraft (Phase 6 — live AI text). Split generation:
 * the technicalText prose streams token-by-token (the actual "word-by-word" ask); the
 * BOQ/scope/payment-terms JSON is generated as one structured call afterward — streaming a
 * partial JSON object token-by-token and incrementally parsing it is a much harder, more
 * fragile problem than this codebase needs to take on for a cosmetic UX win.
 *
 * Claude configured → real token stream, then a structured follow-up call for the rest.
 * Otherwise (Groq/Gemini/template) → generate the full draft as before (no live provider
 * stream available cheaply), then SIMULATE a word-paced reveal over the same onToken
 * callback so the client-side plumbing (SSE reader, incremental state) is identical and
 * fully testable in this environment (no AI keys here — see ai.ts's fallback comment).
 */

const DRAFT_SCHEMA_NO_TEXT = {
  ...DRAFT_SCHEMA,
  // Everything except technicalText, which streams separately via onToken.
  required: [
    "coverLetter",
    "pointsToNote",
    "technologyExplainer",
    "boqItems",
    "scopeOfWork",
    "technicalSpecs",
    "electricalLoad",
    "paymentTerms",
  ],
  properties: {
    coverLetter: DRAFT_SCHEMA.properties.coverLetter,
    pointsToNote: DRAFT_SCHEMA.properties.pointsToNote,
    technologyExplainer: DRAFT_SCHEMA.properties.technologyExplainer,
    boqItems: DRAFT_SCHEMA.properties.boqItems,
    scopeOfWork: DRAFT_SCHEMA.properties.scopeOfWork,
    technicalSpecs: DRAFT_SCHEMA.properties.technicalSpecs,
    electricalLoad: DRAFT_SCHEMA.properties.electricalLoad,
    paymentTerms: DRAFT_SCHEMA.properties.paymentTerms,
  },
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chunk text into words and hand them to onToken with a small delay — a paced reveal
 *  for providers with no cheap token stream (Groq/Gemini/template). */
async function simulateStream(text: string, onToken: (chunk: string) => void): Promise<void> {
  const words = text.split(/(\s+)/); // keep whitespace so words rejoin cleanly
  for (const w of words) {
    if (!w) continue;
    onToken(w);
    await sleep(12);
  }
}

async function claudeStreamDraft(
  input: AiProposalInput,
  apiKey: string,
  model: string,
  onToken: (chunk: string) => void,
): Promise<AiProposalDraft> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const proseSystem = `You are a wastewater treatment proposal engineer for Green Ecocare (Coimbatore, Tamil Nadu, India). Write ONLY the technical write-up prose for a treatment plant proposal — process description, design basis, treatment stages, and TNPCB-norm outcome language. No markdown headers, no JSON, no preamble — just the write-up text.`;
  const proseUser = `Requirement: ${input.description}\nPlant type: ${input.plantType || "STP"}\nTechnology: ${input.technology || "MBBR"}\nCapacity: ${input.capacityKLD || "unspecified"} KLD${input.budgetHint ? `\nBudget hint: ₹${input.budgetHint}` : ""}`;

  let technicalText = "";
  const stream = client.messages.stream({
    model,
    max_tokens: 2000,
    system: proseSystem,
    messages: [{ role: "user", content: proseUser }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      technicalText += event.delta.text;
      onToken(event.delta.text);
    }
  }

  const jsonSystem = `You are a wastewater treatment proposal engineer for Green Ecocare (Coimbatore, Tamil Nadu, India). Produce a cover letter, points to note, technology explainer, a KLD-scaled Bill of Quantity (BOQ), scope of work, technical specifications, electrical load summary, and payment terms for STP/ETP/WTP plants that meet TNPCB discharge norms. Respond with STRICT JSON only. Rates are in INR. Keep BOQ realistic for the Indian market.`;
  const res = await client.messages.create({
    model,
    max_tokens: 6000,
    system: jsonSystem,
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA_NO_TEXT } } as never,
    messages: [{ role: "user", content: draftPrompt(input) }],
  });
  const text = res.content.map((b) => ("text" in b ? b.text : "")).join("");
  const rest = mapDraft(parseDefensively(text), input, "claude");

  return { ...rest, technicalText, source: "claude" };
}

export async function streamProposalDraft(
  input: AiProposalInput,
  onToken: (chunk: string) => void,
): Promise<AiProposalDraft> {
  const cfg = await loadConfig();
  if (cfg.ANTHROPIC_API_KEY) {
    try {
      return await claudeStreamDraft(input, cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL, onToken);
    } catch (e) {
      console.error("Claude streaming generation failed, falling back:", e);
    }
  }
  const draft = await generateProposalDraft(input);
  await simulateStream(draft.technicalText, onToken);
  return draft;
}
