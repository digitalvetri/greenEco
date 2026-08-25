import { projectReportTemplate, processUnitsFor } from "../project-report-templates";
import {
  DEFAULT_INLET_PARAMETERS,
  DEFAULT_OUTLET_PARAMETERS,
} from "../project-report-boilerplate";
import type { ProposalDocumentData, ProjectReportData, BoqProposalData } from "./proposal-document";

/**
 * Seed a new proposal's `documentData` from the per-technology template.
 *
 * The admin edits a **copy**, deliberately — a proposal already sent to a customer
 * must never silently change because someone later revised the template. This is the
 * same reason `ProposalVersion.terms` is a copy of `standardTermsTemplate` rather
 * than a reference to it.
 *
 * Pure, so it can be unit-tested and called from inside `convertToProposal`'s
 * transaction without a DB round-trip.
 */
export function seedDocumentData(input: {
  proposalType: string;
  technology: string;
  plantType: string;
  capacityKLD: number;
}): ProposalDocumentData {
  switch (input.proposalType) {
    case "Project Proposal":
      return seedProjectReport(input);
    case "BOQ Proposal":
      return seedBoqProposal(input);
    default:
      // Service / AMC have no sample format yet — start empty rather than invent one.
      return {};
  }
}

function seedProjectReport(input: {
  technology: string;
  plantType: string;
  capacityKLD: number;
}): ProjectReportData {
  const tpl = projectReportTemplate(input.technology);
  // No sample document for this technology (SAFF/DAF) — seed only what is genuinely
  // technology-agnostic. Better an empty engineering section the admin must fill than
  // MBBR's content under a SAFF heading.
  if (!tpl) {
    return {
      capacityCalc: { usagePerHead: 45 },
      inletParameters: [...DEFAULT_INLET_PARAMETERS],
      outletParameters: [...DEFAULT_OUTLET_PARAMETERS],
      loadFactorOfSafetyPct: 10,
    };
  }
  return {
    // ONLY the industry-standard 45 lpd/head is seeded. `people` and `factorOfSafety`
    // are deliberately left blank: §6.1 prints the headcount as a stated fact about the
    // customer's site ("Total number of people working in factory all 3 shifts = N"),
    // and back-computing one from the KLD would fabricate it. The creation wizard asks
    // for it; the lead-detail Create button doesn't, so a proposal made there would
    // otherwise carry an unreviewed invented figure into a client-facing document.
    capacityCalc: { usagePerHead: 45 },
    inletParameters: [...DEFAULT_INLET_PARAMETERS],
    outletParameters: [...DEFAULT_OUTLET_PARAMETERS],
    recommendation: tpl.recommendation,
    flowChart: [...tpl.flowChart.main],
    sludgeBranchAfter: tpl.flowChart.sludgeBranchAfter,
    dosingBranchAt: tpl.flowChart.dosingBranchAt,
    processUnits: processUnitsFor(input.technology).map((u) => ({ ...u })),
    equipment: tpl.equipment.map((e) => ({ ...e })),
    materialSpecs: tpl.materialSpecs.map((m) => ({ ...m, lines: [...m.lines] })),
    loadFactorOfSafetyPct: 10,
  };
}

function seedBoqProposal(input: { plantType: string; capacityKLD: number }): BoqProposalData {
  const lpd = Math.round(input.capacityKLD * 1000);
  return {
    estimateTitle:
      lpd > 0
        ? `${lpd.toLocaleString("en-IN")} LITRES PER DAY ${input.plantType}`
        : `${input.plantType} MACHINERIES ESTIMATE`,
    estimateSubtitle: "MECHANICAL, ELECTRICAL AND PLUMBING MATERIAL DETAILS",
  };
}

/**
 * The electrical-load rows a new Project Report starts with. Kept separate from
 * `documentData` because `ProposalVersion.electricalLoad` is an existing column with
 * existing consumers (the editor's table, the v29 print section) — the widened row
 * shape stays backward-compatible.
 */
export function seedElectricalLoad(technology: string) {
  // Same rule as the document seed: no template ⇒ no rows, never another
  // technology's load table under this technology's name.
  return (projectReportTemplate(technology)?.electricalLoad ?? []).map((r) => ({
    description: r.description,
    hp: r.hp,
    hpPerUnit: r.hpPerUnit,
    units: r.units,
    running: r.running,
    standby: r.standby,
  }));
}
