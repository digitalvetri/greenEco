import { describe, it, expect } from "vitest";
import { signPrintToken, verifyPrintToken, type PrintClaims } from "./print-token";

const base: Omit<PrintClaims, "exp"> = {
  docType: "invoice",
  docId: "GEC-INV-0001",
  userId: "dev-admin",
  role: "ADMIN",
  companyId: "green-ecocare",
};

describe("print-token", () => {
  it("round-trips valid claims", () => {
    const t = signPrintToken(base);
    const r = verifyPrintToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.docType).toBe("invoice");
      expect(r.claims.docId).toBe("GEC-INV-0001");
      expect(r.claims.userId).toBe("dev-admin");
      expect(r.claims.role).toBe("ADMIN");
    }
  });

  it("rejects a tampered payload (invoice A token cannot claim invoice B)", () => {
    const t = signPrintToken(base);
    const [, , sig] = t.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...base, docId: "GEC-INV-9999", exp: Math.floor(Date.now() / 1000) + 120 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const forged = `v1.${forgedPayload}.${sig}`;
    const r = verifyPrintToken(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-signature");
  });

  it("rejects an expired token", () => {
    const t = signPrintToken(base, 120, 1_000_000_000_000);
    const r = verifyPrintToken(t, 1_000_000_000_000 + 121_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("accepts a token that has not yet expired", () => {
    const t = signPrintToken(base, 120, 1_000_000_000_000);
    const r = verifyPrintToken(t, 1_000_000_000_000 + 119_000);
    expect(r.ok).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(verifyPrintToken("garbage").ok).toBe(false);
    expect(verifyPrintToken("v1.only-two").ok).toBe(false);
    expect(verifyPrintToken("v2.a.b").ok).toBe(false);
  });

  it("rejects a forged signature of the correct length", () => {
    const t = signPrintToken(base);
    const [v, payload] = t.split(".");
    const fakeSig = "A".repeat(t.split(".")[2].length);
    const r = verifyPrintToken(`${v}.${payload}.${fakeSig}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-signature");
  });
});
