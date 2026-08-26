import { describe, it, expect } from "vitest";
import { proposalSections } from "./proposal-document";

/**
 * These assertions exist because the editor and the print templates can drift: a card
 * that edits a field nothing prints is dead work the admin still has to scroll past,
 * and a field that prints with no card is content on a customer-facing document that
 * cannot be corrected. Both have happened here (v46 and v51 respectively).
 */
describe("proposalSections", () => {
  it("gives the Project Report every narrative block", () => {
    const s = proposalSections("Project Proposal");
    for (const k of ["aiGenerate", "heroImage", "coverLetter", "technicalText", "technologyExplainer", "technicalSpecs", "electricalLoad", "projectReportSections", "paymentTerms", "terms"] as const) {
      expect(s.has(k), k).toBe(true);
    }
  });

  it("hides from the AMC everything its document never prints", () => {
    const s = proposalSections("AMC Proposal");
    for (const k of ["heroImage", "technicalText", "technologyExplainer", "technicalSpecs", "electricalLoad", "aiGenerate"] as const) {
      expect(s.has(k), k).toBe(false);
    }
    // What it DOES print.
    expect(s.has("coverLetter")).toBe(true);
    expect(s.has("amcSections")).toBe(true);
    expect(s.has("terms")).toBe(true);
  });

  it("gives the AMC no payment terms — winning one makes a contract, not an order", () => {
    expect(proposalSections("AMC Proposal").has("paymentTerms")).toBe(false);
    expect(proposalSections("Service Proposal").has("paymentTerms")).toBe(false);
  });

  it("keeps payment terms on a BOQ even though its document doesn't print them", () => {
    // Winning a BOQ creates an Order, and the milestones are derived from these.
    expect(proposalSections("BOQ Proposal").has("paymentTerms")).toBe(true);
  });

  it("reduces the Service proforma to its own fields", () => {
    const s = proposalSections("Service Proposal");
    expect(s.has("serviceSections")).toBe(true);
    // No cover letter and no T&Cs page — the proforma carries a declaration line.
    expect(s.has("coverLetter")).toBe(false);
    expect(s.has("terms")).toBe(false);
  });

  it("gives an unknown or absent type the full generic editor", () => {
    // A proposal created before types existed prints through the generic layout,
    // which DOES render every narrative block — so hiding them would lose content.
    for (const t of [null, undefined, "", "Others", "Something New"]) {
      const s = proposalSections(t);
      expect(s.has("coverLetter"), String(t)).toBe(true);
      expect(s.has("technicalText"), String(t)).toBe(true);
      expect(s.has("electricalLoad"), String(t)).toBe(true);
    }
  });

  it("never shows one type's bespoke sections on another", () => {
    expect(proposalSections("Project Proposal").has("amcSections")).toBe(false);
    expect(proposalSections("AMC Proposal").has("projectReportSections")).toBe(false);
    expect(proposalSections("Service Proposal").has("amcSections")).toBe(false);
  });
});
