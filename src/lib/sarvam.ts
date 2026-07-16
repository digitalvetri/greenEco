/**
 * Sarvam AI client (OpenAI-compatible /v1/chat/completions).
 * Sarvam is an Indian AI company specialized in Indian languages including Tamil.
 * Preferred provider when responding in Tamil — superior to generic LLMs for
 * Indian language understanding and generation.
 *
 * Credentials come from runtime-config (DB over .env) so a key pasted in
 * Settings → Integrations works with no restart. Returns null on failure
 * so callers fall back gracefully — never throws.
 */

import { loadConfig } from "./runtime-config";

const SARVAM_BASE = "https://api.sarvam.ai/v1";

export async function sarvamConfigured(): Promise<boolean> {
  return !!(await loadConfig()).SARVAM_API_KEY;
}

export async function sarvamCompleteWith(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${SARVAM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function sarvamComplete(
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const cfg = await loadConfig();
  return sarvamCompleteWith(cfg.SARVAM_API_KEY, cfg.SARVAM_MODEL, system, user, opts);
}
