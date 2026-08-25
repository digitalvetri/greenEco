import { describe, it, expect } from "vitest";
import {
  computeCapacity,
  computeLoadTotals,
  parseDocumentData,
  asProjectReportData,
  schemaForType,
} from "./proposal-document";
import { PROJECT_REPORT_TEMPLATES } from "../project-report-templates";
import { shouldPrintStandardTerms, resolvePointsToNote } from "../project-report-boilerplate";

describe("computeCapacity", () => {
  it("reproduces the sample document's arithmetic exactly", () => {
    // From the client's real Project Report: 500 people × 45 lpd = 22,500;
    // + 7,500 factor of safety = 30,000 LPD ≈ 30 KLD.
    const r = computeCapacity({ people: 500, usagePerHead: 45, factorOfSafety: 7500 });
    expect(r.sewagePerDay).toBe(22_500);
    expect(r.designCapacityLPD).toBe(30_000);
    expect(r.designCapacityKLD).toBe(30);
  });

  it("returns zeros rather than NaN for a half-filled form", () => {
    expect(computeCapacity(undefined)).toEqual({ sewagePerDay: 0, designCapacityLPD: 0, designCapacityKLD: 0 });
    expect(computeCapacity({ people: 200 }).designCapacityLPD).toBe(0);
  });

  it("rounds KLD to a whole number as the samples print it", () => {
    expect(computeCapacity({ people: 100, usagePerHead: 45, factorOfSafety: 0 }).designCapacityKLD).toBe(5); // 4,500 → 5
    expect(computeCapacity({ people: 1000, usagePerHead: 100, factorOfSafety: 0 }).designCapacityKLD).toBe(100);
  });

  it("treats the factor of safety as litres, not a percentage", () => {
    const r = computeCapacity({ people: 10, usagePerHead: 10, factorOfSafety: 500 });
    expect(r.sewagePerDay).toBe(100);
    expect(r.designCapacityLPD).toBe(600);
  });
});

describe("computeLoadTotals", () => {
  it("reproduces the MBBR sample's HP chain: 10.0 → +10% → 11.0 → 11 HP → 8.5 kW", () => {
    const r = computeLoadTotals(PROJECT_REPORT_TEMPLATES.MBBR.electricalLoad);
    expect(r.hp).toBe(10);
    expect(r.factorOfSafetyHp).toBe(1);
    expect(r.totalHp).toBe(11);
    expect(r.requiredHp).toBe(11);
    expect(r.kw).toBeCloseTo(8.2, 1); // sample prints 8.2027 kW (11 HP × 0.7457)
    expect(r.supplyKw).toBe(8.5); // sample prints "≈ 8.5 kW"
  });

  it("reproduces the SBR sample's HP chain, incl. its 0.6 HP row and 2-decimal totals", () => {
    // Sample prints 11.6 / 1.16 / 12.76 → "≈ 13 HP" → 9.694 kW → "≈ 10 kW".
    // This is the case that proves the totals carry 2 decimals, not 1.
    const r = computeLoadTotals(PROJECT_REPORT_TEMPLATES.SBR.electricalLoad);
    expect(r.hp).toBe(11.6);
    expect(r.factorOfSafetyHp).toBe(1.16);
    expect(r.totalHp).toBe(12.76);
    expect(r.requiredHp).toBe(13);
    expect(r.kw).toBeCloseTo(9.69, 1);
    expect(r.supplyKw).toBe(10);
  });

  it("computes unit/running counts honestly, not the sample's copy-pasted totals", () => {
    // The MBBR sample prints Total 10 units / 6 running, but its own five rows sum
    // to 9 and 5 — those are the SBR table's numbers left behind. Same class of slip
    // as the ASP sample's mis-titled flow chart: match the format, fix the mistake.
    const r = computeLoadTotals(PROJECT_REPORT_TEMPLATES.MBBR.electricalLoad);
    expect(r.units).toBe(9);
    expect(r.running).toBe(5);
    expect(r.standby).toBe(4);
    // SBR genuinely has six rows, and there its printed 10/6/4 IS right.
    const sbr = computeLoadTotals(PROJECT_REPORT_TEMPLATES.SBR.electricalLoad);
    expect([sbr.units, sbr.running, sbr.standby]).toEqual([10, 6, 4]);
  });

  it("handles an empty table without dividing by zero", () => {
    expect(computeLoadTotals([])).toMatchObject({ hp: 0, totalHp: 0, requiredHp: 0, kw: 0, supplyKw: 0 });
  });

  it("honours a custom factor of safety", () => {
    const rows = [{ description: "Pump", hp: 20, units: 1, running: 1, standby: 0 }];
    expect(computeLoadTotals(rows, 0).totalHp).toBe(20);
    expect(computeLoadTotals(rows, 25).totalHp).toBe(25);
  });
});

describe("per-type document schemas", () => {
  it("routes each proposal type to its own schema", () => {
    // All four are now distinct. AMC and Service used to share the generic schema, but
    // winning one creates a real ServiceContract / ServiceTicket, so each needs the
    // fields that record is built from.
    const types = ["Project Proposal", "BOQ Proposal", "AMC Proposal", "Service Proposal"];
    const schemas = types.map(schemaForType);
    expect(new Set(schemas).size).toBe(4);
    // An unknown type still falls back to the generic schema rather than throwing.
    expect(schemaForType("Others")).toBe(schemaForType(undefined));
  });

  it("keeps the AMC terms a contract is built from", () => {
    const parsed = parseDocumentData("AMC Proposal", {
      termMonths: 24,
      frequency: "MONTHLY",
      visitsPerYear: 12,
      scope: { mechanical: "Blower service", exclusions: "Civil repairs" },
    }) as Record<string, unknown>;
    expect(parsed.termMonths).toBe(24);
    expect(parsed.visitsPerYear).toBe(12);
    expect((parsed.scope as Record<string, string>).exclusions).toBe("Civil repairs");
  });

  it("rejects an AMC term that could not produce a sane visit schedule", () => {
    expect(() => parseDocumentData("AMC Proposal", { termMonths: 0 })).toThrow();
    expect(() => parseDocumentData("AMC Proposal", { visitsPerYear: 999 })).toThrow();
    expect(() => parseDocumentData("AMC Proposal", { frequency: "FORTNIGHTLY" })).toThrow();
  });

  it("keeps the Service job fields a ticket is built from", () => {
    const parsed = parseDocumentData("Service Proposal", {
      jobDescription: "Replace the aeration blower",
      priority: "HIGH",
    }) as Record<string, unknown>;
    expect(parsed.jobDescription).toBe("Replace the aeration blower");
    expect(parsed.priority).toBe("HIGH");
  });

  it("does not let one type's fields land on another", () => {
    // The wizard sends whichever block applies; saveVersion validates against THIS
    // proposal's schema, so a stray AMC term can't end up on a service job.
    const onService = parseDocumentData("Service Proposal", {
      jobDescription: "Fix pump",
      termMonths: 24,
    }) as Record<string, unknown>;
    expect("termMonths" in onService).toBe(false);
  });

  it("accepts an empty payload — every field is optional", () => {
    expect(() => parseDocumentData("Project Proposal", {})).not.toThrow();
    expect(() => parseDocumentData("BOQ Proposal", undefined)).not.toThrow();
  });

  it("keeps Project Report fields it knows", () => {
    const parsed = parseDocumentData("Project Proposal", {
      capacityCalc: { people: 500, usagePerHead: 45, factorOfSafety: 7500 },
      recommendation: "Use MBBR.",
      flowChart: ["SEWAGE INLET", "MBBR TANK"],
    }) as Record<string, unknown>;
    expect(parsed.recommendation).toBe("Use MBBR.");
    expect((parsed.flowChart as string[]).length).toBe(2);
  });

  it("rejects a structurally wrong payload rather than storing garbage", () => {
    expect(() => parseDocumentData("Project Proposal", { capacityCalc: { people: -5 } })).toThrow();
    expect(() => parseDocumentData("Project Proposal", { flowChart: "not-an-array" })).toThrow();
  });

  it("asProjectReportData degrades to {} for another type's data or legacy null", () => {
    // A proposal created before this field existed, or one of a different type,
    // must render as "no data yet" rather than crash the print route.
    expect(asProjectReportData(null)).toEqual({});
    expect(asProjectReportData({ flowChart: "wrong" })).toEqual({});
  });
});

describe("project report templates", () => {
  it("covers exactly the four technologies with sample documents", () => {
    expect(Object.keys(PROJECT_REPORT_TEMPLATES).sort()).toEqual(["ASP", "MBBR", "MBR", "SBR"]);
  });

  it("gives each technology its own recommendation and biological stage", () => {
    const recs = Object.values(PROJECT_REPORT_TEMPLATES).map((t) => t.recommendation);
    expect(new Set(recs).size).toBe(4);
    expect(PROJECT_REPORT_TEMPLATES.MBBR.flowChart.main).toContain("MBBR TANK");
    expect(PROJECT_REPORT_TEMPLATES.SBR.flowChart.main).toContain("SBR TANK");
    expect(PROJECT_REPORT_TEMPLATES.MBR.flowChart.main).toContain("MBR TANK");
    expect(PROJECT_REPORT_TEMPLATES.ASP.flowChart.main).toContain("AERATION TANK");
  });

  it("reflects the equipment differences the samples actually show", () => {
    const names = (t: keyof typeof PROJECT_REPORT_TEMPLATES) =>
      PROJECT_REPORT_TEMPLATES[t].equipment.map((e) => e.name);
    // SBR adds a decanting pump; MBR swaps the filter train for a membrane unit.
    expect(names("SBR")).toContain("Decanting Pump");
    expect(names("MBBR")).not.toContain("Decanting Pump");
    expect(names("MBR")).toContain("Membrane unit");
    expect(names("MBR")).not.toContain("Pressure Sand Filter vessel with Media");
    expect(names("ASP")).toContain("Pressure Sand Filter vessel with Media");
  });

  it("does not reproduce the client's own copy-paste slip in the ASP sample", () => {
    // Their ASP document titles its flow chart "30 KLD MBBR". Match the format,
    // not the mistake.
    expect(PROJECT_REPORT_TEMPLATES.ASP.flowChart.main).not.toContain("MBBR TANK");
  });
});

describe("section precedence (prevents duplicated boilerplate in Phase C)", () => {
  const TEMPLATE = "Taxes & Duties:\nAll taxes as per law.\n\nWarranty:\nTwelve months.";

  it("suppresses the generic T&Cs page on a Project Report using the untouched template", () => {
    // §10.2 / §12 / §13 / §11 already carry this content — printing both duplicates a page.
    expect(
      shouldPrintStandardTerms({ proposalType: "Project Proposal", terms: TEMPLATE, companyTemplate: TEMPLATE }),
    ).toBe(false);
  });

  it("still prints it when the admin customised the terms for this deal", () => {
    expect(
      shouldPrintStandardTerms({
        proposalType: "Project Proposal",
        terms: TEMPLATE + "\n\nSpecial clause for this customer.",
        companyTemplate: TEMPLATE,
      }),
    ).toBe(true);
  });

  it("ignores whitespace-only differences when deciding 'customised'", () => {
    expect(
      shouldPrintStandardTerms({
        proposalType: "Project Proposal",
        terms: TEMPLATE.replace(/\n/g, "\n  "),
        companyTemplate: TEMPLATE,
      }),
    ).toBe(false);
  });

  it("always prints for types with no numbered sections", () => {
    for (const t of ["BOQ Proposal", "AMC Proposal", "Service Proposal", "Others"]) {
      expect(shouldPrintStandardTerms({ proposalType: t, terms: TEMPLATE, companyTemplate: TEMPLATE })).toBe(true);
    }
  });

  it("prints nothing when there are no terms at all", () => {
    expect(shouldPrintStandardTerms({ proposalType: "BOQ Proposal", terms: "  ", companyTemplate: TEMPLATE })).toBe(false);
  });

  it("prefers a per-proposal points-to-note over the company standard, never both", () => {
    expect(resolvePointsToNote("Deal-specific caveat", "Company standard")).toBe("Deal-specific caveat");
    expect(resolvePointsToNote(null, "Company standard")).toBe("Company standard");
    expect(resolvePointsToNote("   ", "Company standard")).toBe("Company standard");
  });
});
