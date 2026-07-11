/**
 * Pure parser for WhatsApp Cloud API inbound webhook payloads (spec §7.1 —
 * two-way). Extracts text messages; ignores statuses/reactions/media. Kept pure
 * and unit-tested because the live receive path can't be exercised without a
 * Meta WhatsApp number.
 *
 * Shape: entry[].changes[].value.messages[] with { from, type:"text", text.body }.
 */
export interface InboundMessage {
  from: string; // sender wa_id (digits)
  text: string;
}

export function parseInboundWhatsApp(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const body = payload as {
    entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[];
  };
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const msg of change?.value?.messages ?? []) {
        if (msg?.type === "text" && msg.from && msg.text?.body) {
          out.push({ from: msg.from.replace(/\D/g, ""), text: msg.text.body });
        }
      }
    }
  }
  return out;
}

/** Normalize an Indian number to its last 10 digits for lead matching. */
export function last10(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
