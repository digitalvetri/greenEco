import { describe, it, expect } from "vitest";
import { renderMessage, sendWhatsApp } from "./whatsapp";

describe("whatsapp message rendering (deterministic)", () => {
  it("renders a payment reminder with client, amount, order, date", () => {
    const msg = renderMessage({
      kind: "PAYMENT_REMINDER",
      to: "9876543210",
      orderNo: "GEC-ORD-2026-001",
      amount: "₹1,50,000",
      dueDate: "10-Jul-2026",
      client: "Acme Textiles",
    });
    expect(msg).toContain("Acme Textiles");
    expect(msg).toContain("₹1,50,000");
    expect(msg).toContain("GEC-ORD-2026-001");
    expect(msg).toContain("10-Jul-2026");
  });

  it("renders a proposal delivery with number, project, url", () => {
    const msg = renderMessage({
      kind: "PROPOSAL_DELIVERY",
      to: "9876543210",
      number: "GEC-PRO-2026-007",
      url: "https://x/pdfs/proposal/abc.pdf",
      projectName: "STP 50 KLD",
    });
    expect(msg).toContain("GEC-PRO-2026-007");
    expect(msg).toContain("STP 50 KLD");
    expect(msg).toContain("https://x/pdfs/proposal/abc.pdf");
  });
});

describe("whatsapp transport selection", () => {
  it("no-ops (transport 'none') when nothing is configured", async () => {
    // Test env has no WHATSAPP_* vars set.
    const r = await sendWhatsApp({
      kind: "PAYMENT_REMINDER",
      to: "9876543210",
      orderNo: "O",
      amount: "₹1",
      dueDate: "d",
      client: "c",
    });
    expect(r.sent).toBe(false);
    expect(r.transport).toBe("none");
  });
});
