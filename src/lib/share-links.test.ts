import { describe, it, expect } from "vitest";
import { waShareLink, mailtoLink } from "./share-links";

describe("waShareLink", () => {
  it("strips non-digits and prefixes country code", () => {
    expect(waShareLink("98765 43210", "hi")).toBe("https://wa.me/919876543210?text=hi");
  });
});

describe("mailtoLink", () => {
  it("encodes to/subject/body into a mailto: URL", () => {
    const link = mailtoLink("client@example.com", "Proposal ready", "Hi there, see attached.");
    expect(link).toBe(
      "mailto:client%40example.com?subject=Proposal%20ready&body=Hi%20there%2C%20see%20attached.",
    );
  });
});
