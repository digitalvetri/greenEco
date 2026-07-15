import { loadConfig } from "./runtime-config";

/**
 * Thin Groq client (OpenAI-compatible /chat/completions). Cheap + fast for text. Returns
 * null when unconfigured or on any failure so callers fall back gracefully — never throws.
 * Credentials come from runtime-config (DB over .env) so a key pasted in Settings works
 * with no restart. `groqCompleteWith` is the credential-explicit form used by the llm layer.
 */

export async function groqConfigured(): Promise<boolean> {
  return !!(await loadConfig()).GROQ_API_KEY;
}

export async function groqCompleteWith(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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

export async function groqComplete(system: string, user: string, opts?: { maxTokens?: number; temperature?: number }): Promise<string | null> {
  const cfg = await loadConfig();
  return groqCompleteWith(cfg.GROQ_API_KEY, cfg.GROQ_MODEL, system, user, opts);
}
