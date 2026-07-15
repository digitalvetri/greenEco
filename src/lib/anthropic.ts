/**
 * Thin Claude text helper (Messages API via the SDK, dynamically imported so it's only
 * loaded when a key is set). Credential-explicit — the caller resolves the key/model from
 * runtime-config. Returns null on unconfigured/failure so callers fall back — never throws.
 */
export async function anthropicText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: opts?.maxTokens ?? 800,
      temperature: opts?.temperature ?? 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((c) => c.type === "text");
    const text = block && "text" in block ? block.text.trim() : "";
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
