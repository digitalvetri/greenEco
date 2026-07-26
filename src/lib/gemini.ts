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

/**
 * Image generation (Gemini's native image-output models, e.g. "gemini-2.5-flash-image" —
 * a DIFFERENT model from the text one in GEMINI_MODEL; configurable separately as
 * GEMINI_IMAGE_MODEL since image-model names/availability change faster than text ones
 * and this must stay correctable from Settings without a code change). Returns the raw
 * image bytes (base64) + mime type, or null on any failure/unconfigured/no-image-in-response
 * — callers must degrade cleanly (e.g. a proposal PDF renders fine with no hero image).
 * Response field names are read defensively (camelCase and snake_case) since exact REST
 * JSON casing for this response shape wasn't verified against a live key.
 */
export async function geminiGenerateImage(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // Gemini's image models reject `responseModalities: ["IMAGE"]` alone (400
        // INVALID_ARGUMENT) — TEXT must be requested alongside IMAGE even though we
        // discard the text part below. Confirmed against the official REST sample.
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[gemini] image generation ${res.status} for model "${model}": ${body.slice(0, 500)}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: Array<Record<string, unknown>> } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = (part.inlineData ?? part.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
      const b64 = inline?.data;
      const mimeType = inline?.mimeType ?? inline?.mime_type;
      if (b64 && mimeType) return { base64: b64, mimeType };
    }
    console.error(`[gemini] image generation for model "${model}" returned no inline image part: ${JSON.stringify(data).slice(0, 500)}`);
    return null;
  } catch (e) {
    console.error(`[gemini] image generation threw for model "${model}":`, e);
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
