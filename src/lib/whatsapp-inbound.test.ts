import { describe, it, expect } from "vitest";
import { parseInboundWhatsApp, last10 } from "./whatsapp-inbound";

const sample = {
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              { from: "919876543210", type: "text", text: { body: "Interested in a 50 KLD STP" } },
              { from: "919000000000", type: "reaction" }, // ignored
              { from: "919111111111", type: "text", text: { body: "What's the price?" } },
            ],
          },
        },
      ],
    },
  ],
};

describe("parseInboundWhatsApp", () => {
  it("extracts text messages, ignoring non-text", () => {
    const msgs = parseInboundWhatsApp(sample);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ from: "919876543210", text: "Interested in a 50 KLD STP" });
    expect(msgs[1].text).toBe("What's the price?");
  });

  it("returns [] for a status-only or malformed payload", () => {
    expect(parseInboundWhatsApp({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toEqual([]);
    expect(parseInboundWhatsApp({})).toEqual([]);
    expect(parseInboundWhatsApp(null)).toEqual([]);
  });
});

describe("last10", () => {
  it("normalizes to the last 10 digits", () => {
    expect(last10("919876543210")).toBe("9876543210");
    expect(last10("+91 98765 43210")).toBe("9876543210");
    expect(last10("9876543210")).toBe("9876543210");
  });
});
