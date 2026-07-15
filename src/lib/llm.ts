import { loadConfig } from "./runtime-config";
import { groqCompleteWith } from "./groq";
import { geminiComplete } from "./gemini";
import { anthropicText } from "./anthropic";

/**
 * Provider-agnostic text/JSON completion. Picks among whichever AI providers are configured
 * (Groq, Gemini, Claude), in a preference order, and returns the first successful response.
 * This is what makes the three key fields non-hollow: a Groq-only OR Gemini-only OR
 * Anthropic-only setup all produce AI output. Callers ALWAYS keep a non-AI fallback (the
 * template/numeric floor) for when nothing is configured — llm* returns null in that case.
 *
 * Preference: an explicit `prefer`, else the AI_TEXT_PROVIDER setting, else "auto"
 * (groq → gemini → anthropic: cheapest/fastest first, Claude reserved but still usable).
 */

export type Provider = "groq" | "gemini" | "anthropic";

const AUTO_ORDER: Provider[] = ["groq", "gemini", "anthropic"];

function orderFor(prefer: string): Provider[] {
  if (prefer === "groq" || prefer === "gemini" || prefer === "anthropic") {
    return [prefer, ...AUTO_ORDER.filter((p) => p !== prefer)];
  }
  return AUTO_ORDER;
}

export interface LlmResult {
  text: string;
  provider: Provider;
}

/** First-success text completion across configured providers. null → none configured/all failed. */
export async function llmText(
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number; prefer?: Provider },
): Promise<LlmResult | null> {
  const cfg = await loadConfig();
  const order = opts?.prefer ? orderFor(opts.prefer) : orderFor(cfg.AI_TEXT_PROVIDER);
  for (const provider of order) {
    let text: string | null = null;
    if (provider === "groq") text = await groqCompleteWith(cfg.GROQ_API_KEY, cfg.GROQ_MODEL, system, user, opts);
    else if (provider === "gemini") text = await geminiComplete(cfg.GEMINI_API_KEY, cfg.GEMINI_MODEL, system, user, opts);
    else text = await anthropicText(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL, system, user, opts);
    if (text) return { text, provider };
  }
  return null;
}

/** Which text providers currently have a key. For readiness/debug. */
export async function configuredTextProviders(): Promise<Provider[]> {
  const cfg = await loadConfig();
  const out: Provider[] = [];
  if (cfg.GROQ_API_KEY) out.push("groq");
  if (cfg.GEMINI_API_KEY) out.push("gemini");
  if (cfg.ANTHROPIC_API_KEY) out.push("anthropic");
  return out;
}

/**
 * JSON completion: appends a strict "return only JSON" instruction, strips ```json fences,
 * and parses. Returns null on no-provider OR unparseable output so the caller falls back to
 * its template. Generic over the expected shape — the caller validates fields defensively.
 */
export async function llmJson<T = unknown>(
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number; prefer?: Provider },
): Promise<{ data: T; provider: Provider } | null> {
  const res = await llmText(
    `${system}\n\nRespond with ONLY a single valid JSON object. No prose, no markdown fences.`,
    user,
    { temperature: 0.2, maxTokens: 2000, ...opts },
  );
  if (!res) return null;
  const parsed = tryParseJson<T>(res.text);
  if (parsed == null) return null;
  return { data: parsed, provider: res.provider };
}

function tryParseJson<T>(raw: string): T | null {
  let s = raw.trim();
  // Strip ```json … ``` or ``` … ``` fences some models add despite instructions.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  // Fall back to the first {...} span if there's leading/trailing chatter.
  if (!s.startsWith("{")) {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
