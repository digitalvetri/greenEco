/**
 * Thin Google Gemini client (generativelanguage `:generateContent` REST — no SDK, zero
 * deps). A third text + vision provider alongside Groq (text) and Claude (text + vision).
 * Every function returns null on unconfigured/failure so callers fall back gracefully —
 * never throws. Credentials are passed in explicitly (resolved from runtime-config by the
 * caller) so this file reads no env directly.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Plain text completion. `system` is sent as system_instruction; `user` as the turn. */
export async function geminiComplete(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.3,
          maxOutputTokens: opts?.maxTokens ?? 800,
        },
      }),
    });
    if (!res.ok) return null;
    return extractText(await res.json());
  } catch {
    return null;
  }
}

/** Vision: read an image (base64) + prompt → text. Used as a Claude-free path for A10. */
export async function geminiVision(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  opts?: { maxTokens?: number },
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: opts?.maxTokens ?? 500 },
      }),
    });
    if (!res.ok) return null;
    return extractText(await res.json());
  } catch {
    return null;
  }
}

function extractText(data: unknown): string | null {
  const d = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parts = d.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const text = parts.map((p) => p.text ?? "").join("").trim();
  return text.length > 0 ? text : null;
}
