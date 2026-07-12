import { env } from "./env";

/**
 * Thin Groq client (OpenAI-compatible /chat/completions). Cheap + fast for the weekly
 * text brief (A13); Claude stays on proposals + vision. Returns null when unconfigured
 * or on any failure so callers fall back gracefully — never throws.
 */
export function groqConfigured(): boolean {
  return !!env.groqApiKey;
}

export async function groqComplete(system: string, user: string, opts?: { maxTokens?: number; temperature?: number }): Promise<string | null> {
  if (!env.groqApiKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.groqApiKey}` },
      body: JSON.stringify({
        model: env.groqModel,
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
