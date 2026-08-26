import { projectReportTemplate, processUnitsFor } from "../project-report-templates";
import {
  DEFAULT_INLET_PARAMETERS,
  DEFAULT_OUTLET_PARAMETERS,
  DEFAULT_AMC_NOTES,
  amcRatesValidityNote,
} from "../project-report-boilerplate";
import type {
  ProposalDocumentData,
  ProjectReportData,
  BoqProposalData,
  AmcProposalData,
} from "./proposal-document";
import {
  DEFAULT_AMC_TERM_MONTHS,
  DEFAULT_AMC_FREQUENCY,
  DEFAULT_AMC_VISITS_PER_YEAR,
} from "./proposal-document";

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
    case "AMC Proposal":
      return seedAmcProposal(input);
    case "Service Proposal":
      // The Proforma Invoice is entirely per-job: its table lines, its "To." block
      // and its validity all come from the deal. Nothing to seed but the notes-free
      // default; the wizard collects the rest.
      return {};
    default:
      return {};
  }
}

/**
 * An AMC Quotation is ~80% the same document as the Project Report — same plant
 * description, same technology write-up, same units and machinery lists. Those are
 * READ FROM the shared template rather than copied into a second source of truth,
 * so a wording fix lands in both documents.
 *
 * `units` and `equipment` ARE snapshotted into documentData, because a real site's
 * tank count and pump count differ from the generic template (the sample has 3 SBR
 * tanks and 5 collection pumps) and the admin must be able to correct them without
 * editing the shared template every other technology also uses.
 */
function seedAmcProposal(input: { technology: string }): AmcProposalData {
  const tpl = projectReportTemplate(input.technology);
  const base: AmcProposalData = {
    termMonths: DEFAULT_AMC_TERM_MONTHS,
    frequency: DEFAULT_AMC_FREQUENCY,
    visitsPerYear: DEFAULT_AMC_VISITS_PER_YEAR,
    notes: DEFAULT_AMC_NOTES,
    ratesValidityNote: amcRatesValidityNote(DEFAULT_AMC_TERM_MONTHS),
  };
  // Same rule as the Project Report: no template for this technology (SAFF/DAF)
  // means seed nothing rather than another technology's equipment list.
  if (!tpl) return base;
  return {
    ...base,
    // The technology's process write-up ("SBR Treatment Process") is one of the
    // template's process units, but it is a NARRATIVE block, not a tank — it prints
    // as its own section. Including it made the units list read "…SBR Tank, SBR
    // Treatment Process, Filter Feed Tank", which is not a piece of plant.
    units: processUnitsFor(input.technology)
      .filter((u) => !/process$/i.test(u.unit))
      .map((u) => u.unit),
    equipment: tpl.equipment.map((e) => ({ name: e.name, qty: e.quantity })),
  };
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
