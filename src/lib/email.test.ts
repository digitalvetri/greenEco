import { describe, it, expect } from "vitest";
import { isEmailConfigured, sendEmail } from "./email";

describe("email gating", () => {
  it("reports not configured without RESEND_API_KEY/EMAIL_FROM", () => {
    // Test env sets neither.
    expect(isEmailConfigured()).toBe(false);
  });

  it("no-ops (does not throw, does not send) when unconfigured", async () => {
    const r = await sendEmail({ to: "a@b.com", subject: "hi", html: "<p>hi</p>" });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/not configured/);
  });
});
