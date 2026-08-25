/**
 * PROJECT REPORT TEMPLATES — the per-technology content of Green Ecocare's real
 * Project Proposal document.
 *
 * Source: the client's own sample PDFs (`STP - {MBBR,SBR,ASP,MBR} - Project Proposal
 * format.pdf`). Diffing the four showed they are ~85% identical; exactly six blocks
 * differ per technology, and those six are what this file holds:
 *
 *   1. `recommendation`  — §6.4's closing "so we suggested to use X" paragraph
 *   2. `flowChart`       — §6.5's process-flow node chain
 *   3. `processUnits`    — §6.6's biological-stage descriptions
 *   4. `equipment`       — §8.i's Machinery & Equipment table
 *   5. `materialSpecs`   — §8.ii's Materials Specifications sheet
 *   6. `electricalLoad`  — §9's load-calculation rows
 *
 * Everything else (introduction, civil design, MEP intro, taxes, warranty, scope,
 * points to note) is company-level boilerplate and lives in Company settings, so the
 * office can edit it without a deploy — same precedent as `standardTermsTemplate`.
 *
 * This is a lookup, NOT AI-generated: the wording is the client's own, it must not
 * drift between proposals, and it has to work with no API key configured.
 *
 * Kept out of `constants.ts` purely for size — that file is the small shared-enum
 * grab-bag and this is several hundred lines of document copy.
 *
 * NOTE ON FIDELITY: the client's ASP sample titles its flow chart "PROCESS FLOW CHART
 * 30 KLD MBBR" and its TOC page numbers don't match the actual pages. Those are
 * copy-paste slips in their source document, not conventions — matched the format,
 * fixed the mistakes.
 */

export interface FlowChartSpec {
  /** Top-to-bottom main chain of the process-flow diagram. */
  main: string[];
  /** Node the sludge branch hangs off, drawn to the left. */
  sludgeBranchAfter: string;
  /** Node the chlorine-dosing branch feeds, drawn to the right. */
  dosingBranchAt: string;
}

export interface ProcessUnit {
  unit: string;
  body: string;
}

export interface EquipmentRow {
  name: string;
  quantity: string;
}

export interface MaterialSpecRow {
  /** e.g. "Collection Pump – 2 Nos" */
  title: string;
  /** Label/value pairs as printed in the sample's two-column spec block. */
  lines: string[];
}

export interface ElectricalLoadRow {
  description: string;
  /** HP per unit. Null where the sample leaves it blank (e.g. the dosing pump). */
  hpPerUnit: number | null;
  units: number;
  running: number;
  standby: number;
  /** Running capacity in HP — the sample's last column. */
  hp: number;
}

export interface ProjectReportTemplate {
  recommendation: string;
  flowChart: FlowChartSpec;
  /** ONLY the biological/clarification stages that differ by technology. Merged
   *  between PROCESS_UNITS_PRE and PROCESS_UNITS_POST when the document renders. */
  processUnits: ProcessUnit[];
  equipment: EquipmentRow[];
  materialSpecs: MaterialSpecRow[];
  electricalLoad: ElectricalLoadRow[];
}

// ---------------------------------------------------------------------------
// Shared process-unit descriptions (identical in all four samples)
// ---------------------------------------------------------------------------

/** Stages before the biological reactor. */
export const PROCESS_UNITS_PRE: ProcessUnit[] = [
  {
    unit: "Bar Screen Chamber",
    body: "Bar screen chamber is the first unit operation designed to remove large floating and suspended solids like rags, plastics, and debris. These screens protect downstream equipment such as pumps, valves, and pipes from damage or clogging by intercepting solids before the wastewater proceeds to anaerobic digester and collection tanks.",
  },
  {
    unit: "Anaerobic Digester",
    body: "An anaerobic digester tank is a sealed, oxygen-free reactor vessel designed to treat organic wastewater, primarily sewage sludge, through biological decomposition. By maintaining precise conditions, these tanks convert organic matter into biogas (a mix of methane and carbon dioxide) and nutrient-rich digestate, reducing sludge volume, odour, and pathogen content.",
  },
  {
    unit: "Equalization cum Collection Tank",
    body: "An equalization tank is a specialized unit within a wastewater treatment facility designed to balance flows and loads. Wastewater flow rates and characteristics often vary considerably due to daily usage patterns. Such variability can compromise downstream processes if not managed properly.\n\nThe equalization tank functions as a buffer system, accumulating and storing wastewater when the flow rate or the concentration of pollutants is high, and releasing it slowly at a controlled rate. This ensures downstream processes receive a relatively constant flow which optimizes performance and efficiency.",
  },
];

/** Stages after the biological reactor / clarification. */
export const PROCESS_UNITS_POST: ProcessUnit[] = [
  {
    unit: "Filter Feed Tank",
    body: "A filter feed tank serves as a storage vessel that holds clarified water before it undergoes tertiary treatment or disinfection. It acts as a buffer to accommodate fluctuations in flow and ensures a steady supply of water to downstream filtration units.",
  },
  {
    unit: "Filtration",
    body: "Filtration systems are primarily used in tertiary treatment to polish effluent, removing suspended solids, turbidity, and residual pathogens to meet reuse or discharge standards. Common technologies include Pressure Sand Filters (PSF) for physical removal of fine particles, and Activated Carbon Filters (ACF) for adsorbing odours and dissolved organic compounds.",
  },
  {
    unit: "Treated Water Tank",
    body: "A treated water tank is the final storage unit for effluent that has undergone primary, secondary, and tertiary treatment processes, including filtration and disinfection. Its primary function is to hold the purified water before it is either discharged into the environment or reused for non-potable applications such as irrigation, toilet flushing, and cooling.",
  },
];

/** The four technology options §6.4 compares before making its recommendation. */
export const TECHNOLOGY_COMPARISON: { key: string; name: string; body: string }[] = [
  {
    key: "ASP",
    name: "Activated Sludge Process (ASP)",
    body: "A widely used method that involves aerating sewage to promote the growth of microorganisms that break down organic matter. Ideal for large residential complexes and municipalities.",
  },
  {
    key: "MBBR",
    name: "Moving Bed Biofilm Reactor (MBBR)",
    body: "Uses floating plastic carriers in aeration tanks for efficient biological treatment. Suitable for areas with space constraints and variable loads.",
  },
  {
    key: "SBR",
    name: "Sequential Batch Reactor (SBR)",
    body: "A time-based treatment process that handles aeration, sedimentation, and decanting in the same tank. Useful for hotels, hospitals, and small municipalities.",
  },
  {
    key: "MBR",
    name: "Membrane Bio-Reactor (MBR)",
    body: "Combines biological treatment and membrane filtration for high-quality effluent. Best suited for locations where treated water reuse is a priority.",
  },
];

// ---------------------------------------------------------------------------
// Shared material-spec entries (same wording in every sample)
// ---------------------------------------------------------------------------

const SPEC_BAR_SCREEN: MaterialSpecRow = {
  title: "SS Bar Screen Basket",
  lines: ["Made: Stainless Steel", "Grade:", "Size: 0.6 x 0.6 x 0.6 m"],
};
const SPEC_COLLECTION_PUMP: MaterialSpecRow = {
  title: "Collection Pump",
  lines: [
    "Type: Sewage Submersible Pump",
    "Model:",
    "Power Capacity: 1.5 kW / 2.0 HP",
    "Rated Discharge: 250 lpm",
    "Phase: 3 Phase (415 V)",
    "Rated Head: 10 m",
    "Max. Current: 4.5 A",
    "Pipe Size: 50 mm",
    "Make: Dharani / Points / Equivalent",
  ],
};
const SPEC_AIR_BLOWER: MaterialSpecRow = {
  title: "Air Blower",
  lines: [
    "Type: Twin Lobe Rotary",
    "Model:",
    "Discharge Capacity: 120 m³/hr",
    "Pressure: 0.4 Kg/cm²",
    "Power Capacity: 5 HP",
    "Speed: 1200 RPM",
    "Make: A1 / ABL / Akash / Equivalent",
  ],
};
const SPEC_BLOWER_MOTOR: MaterialSpecRow = {
  title: "Motor for Air Blower",
  lines: [
    "Type: Twin Lobe Rotary",
    "Model:",
    "Power Capacity: 3.7 kW / 5.0 HP",
    "Phase: 3 Phase (415 V)",
    "Max. Current: 7.3 A",
    "Speed: 1430 RPM",
    "Make: CG / Crompton / Kirloskar / Equivalent",
  ],
};
const SPEC_SLUDGE_PUMP: MaterialSpecRow = {
  title: "Sludge Pump",
  lines: [
    "Type: Sewage Submersible Pump",
    "Model:",
    "Power Capacity: 1.5 kW / 2.0 HP",
    "Rated Discharge: 250 lpm",
    "Phase: 3 Phase (415 V)",
    "Rated Head: 10 m",
    "Max. Current: 4.5 A",
    "Pipe Size: 50 mm",
    "Make: Dharani / Points / Equivalent",
  ],
};
const SPEC_FILTER_FEED_PUMP: MaterialSpecRow = {
  title: "Filter Feed Pump",
  lines: [
    "Type: Sewage Submersible Pump",
    "Model:",
    "Power Capacity: 1.5 kW / 2.0 HP",
    "Rated Discharge: 250 lpm",
    "Phase: 3 Phase (415 V)",
    "Rated Head: 10 m",
    "Max. Current: 4.5 A",
    "Pipe Size: 50 mm",
    "Make: Dharani / Points / Equivalent",
  ],
};
const SPEC_CONTROL_PANEL: MaterialSpecRow = {
  title: "Control Panel",
  lines: ["Type: Wall Mount", "Model:", "Make: Multitek / Equivalent"],
};
const SPEC_PSF: MaterialSpecRow = {
  title: "Pressure Sand Filter vessel with Media",
  lines: [
    "Type: FRP Filter vessel",
    "Model:",
    "Size: 500mm Dia, 1200mm Height",
    "Max. Pressure: 150 PSI",
    "Media Type: Pebbles, Sand",
    "Size of Media: Multi Grade",
    "Make: Atlantic+ / Pentair / Equivalent",
  ],
};
const SPEC_ACF: MaterialSpecRow = {
  title: "Activated Carbon Filter vessel with Media",
  lines: [
    "Type: FRP Filter vessel",
    "Model:",
    "Size: 500mm Dia, 1200mm Height",
    "Max. Pressure: 150 PSI",
    "Media Type: Activated Carbon",
    "Media Size: Multi Grade",
    "Make: Atlantic+ / Pentair / Equivalent",
  ],
};
const SPEC_DOSING: MaterialSpecRow = {
  title: "Dosing Pump & Dosing Tank",
  lines: [
    "Type:",
    "Model:",
    "Max Flow Rate: 6 LPH",
    "Phase: 1 Phase (230 V)",
    "Make: Initiative / Equivalent",
    "Dosing Tank – 1 No, Type: PVC Tank, Capacity: 50 litres",
  ],
};
const SPEC_FLOW_METER: MaterialSpecRow = {
  title: "Flow meter",
  lines: ["Type: Electro Magnetic", "Model:", "Flow Range:", "Phase: 1 Phase (230 V) AC", "Make: Aster / Equivalent"],
};
const SPEC_PLUMBING: MaterialSpecRow = {
  title: "Plumbing Pipe & Fittings",
  lines: [
    "Material: UPVC, Size: 0.5\" to 2.0\", Schedule 40, 80",
    "Material: PVC, Size: 1.0\" to 1.5\", 0.6 kg, 0.4 kg",
    "Make: Supreme / Astral / Finolex / Equivalent",
    "Material: GI, MS, Size: 0.5\" to 5\"",
    "Make: Jindal / JSW / TATA / Equivalent",
  ],
};
const SPEC_CABLE: MaterialSpecRow = {
  title: "Electrical Cable",
  lines: [
    "Type: Flexible, Armoured",
    "Core: 3 core, 4 core",
    "Size: 0.5 sq.mm to 2.5 sq.mm",
    "Make: Polycab / Finolex / Equivalent",
  ],
};
const SPEC_DIFFUSER: MaterialSpecRow = {
  title: "Diffuser",
  lines: ["Type: Tube, Disc", "Membrane: EPDM", "Fine and Coarse Bubbles", "Make: Tecpro / Equivalent"],
};
const SPEC_TOOLS: MaterialSpecRow = {
  title: "Tools",
  lines: ["Spanners, Screw drivers, Pliers, Hand Gloves, Fire Extinguishers."],
};

const SPEC_TAIL = [SPEC_PLUMBING, SPEC_CABLE, SPEC_DIFFUSER, SPEC_TOOLS];

// Equipment rows shared by every variant, in the samples' order.
const EQUIP_HEAD: EquipmentRow[] = [
  { name: "SS Bar Screen Basket", quantity: "1 Number" },
  { name: "Collection Pump", quantity: "2 Numbers" },
  { name: "Air Blower", quantity: "2 Numbers" },
  { name: "Motor for Air Blower", quantity: "2 Numbers" },
];
const EQUIP_TAIL: EquipmentRow[] = [
  { name: "Electro Magnetic Flow Meter", quantity: "1 Number" },
  { name: "Plumbing Pipe and Fittings", quantity: "1 Lot" },
  { name: "Electrical cables and instrumentations", quantity: "1 Lot" },
  { name: "Coarse and Fine bubble Diffusers with SS fittings", quantity: "10 Sets" },
  { name: "Tools & Fire extinguisher", quantity: "1 Set" },
];

const FLOW_HEAD = ["SEWAGE INLET", "SEWAGE LINE BAR SCREEN CHAMBER", "ANAEROBIC DIGESTER", "EQUALISATION CUM COLLECTION TANK (If required)"];
const FLOW_TAIL = [
  "FILTER FEED TANK",
  "FILTERATION (PSF & ACF)",
  "STP TREATED WATER (UF FEED TANK)",
  "ULTRA FILTERATION (IF UF INSTALLED)",
  "UF TREATED TANK (IF UF INSTALLED)",
  "FLUSHING / SAFE DISPOSAL",
];

// ---------------------------------------------------------------------------
// The four technology variants
// ---------------------------------------------------------------------------

export const PROJECT_REPORT_TEMPLATES: Record<string, ProjectReportTemplate> = {
  MBBR: {
    recommendation:
      "MBBR technology is a biological treatment of an STP plant. MBBR media provides the surface area in the aeration system for bacteria to develop. This addition of surface area helps to reduce the aeration tank size and ultimately saves space and cost. The MBBR technology is an economical solution in terms of Capital as well as Operating Costs. So, we suggested to use the MBBR technology in this STP.",
    flowChart: {
      main: [...FLOW_HEAD, "MBBR TANK", "SETTLING TANK", ...FLOW_TAIL],
      sludgeBranchAfter: "SETTLING TANK",
      dosingBranchAt: "FILTERATION (PSF & ACF)",
    },
    processUnits: [
      {
        unit: "MBBR Tank",
        body: "Basin: In an MBBR aeration tank, thousands of media made up of polyethylene are put in place to provide a surface for microorganisms' development. The size of the tank and quantity of media depends on the quantity of water treated per day. Mostly, there are two tanks present for the complete aeration process. MBBR media are round or wheel shaped. Their density matches the density of water, which enables them to neither sink nor float on the surface.\n\nMedia: MBBR tanks are filled up with thousands of small, circular-shaped plastic polyethylene chips. They occupy about 20–30% of the space in the tank and provide surface area for biofilm.\n\nAeration Grid: It helps in the movement of media effectively through the complete tank and provides air inside the water forming a water bubble that enables proper mixing of water. With the help of a blower, air is passed through the pipeline and then to the diffusers.\n\nSieve: It stops the MBBR media from passing through the exit of the tank.",
      },
      {
        unit: "Settling Tank",
        body: "Settling tanks in a Sewage Treatment Plant (STP) are critical units that use gravity to separate suspended solids from wastewater. Settling tanks follow the biological treatment stage (such as the aeration tank). They serve a dual purpose: clarification of the treated water and sludge thickening. These tanks utilize zone settling to separate the activated sludge (biomass) from the effluent. The settled biomass is partially recycled back to the aeration tank to maintain microbial concentration, while the excess is removed as waste sludge.",
      },
    ],
    equipment: [
      ...EQUIP_HEAD,
      { name: "Sludge Pump", quantity: "2 Numbers" },
      { name: "Filter Feed Pump", quantity: "2 Numbers" },
      { name: "Control Panel", quantity: "1 Number" },
      { name: "Pressure Sand Filter vessel with Media", quantity: "1 Number" },
      { name: "Activated Carbon Filter Vessel with Media", quantity: "1 Number" },
      { name: "Dosing Tank with Dosing Pump", quantity: "1 Number" },
      ...EQUIP_TAIL,
    ],
    materialSpecs: [
      SPEC_BAR_SCREEN,
      SPEC_COLLECTION_PUMP,
      SPEC_AIR_BLOWER,
      SPEC_BLOWER_MOTOR,
      SPEC_SLUDGE_PUMP,
      SPEC_FILTER_FEED_PUMP,
      SPEC_CONTROL_PANEL,
      SPEC_PSF,
      SPEC_ACF,
      SPEC_DOSING,
      SPEC_FLOW_METER,
      ...SPEC_TAIL,
    ],
    electricalLoad: [
      { description: "Collection Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Air Blower", hpPerUnit: 5, units: 2, running: 1, standby: 1, hp: 5 },
      { description: "Sludge Pump", hpPerUnit: 1, units: 2, running: 1, standby: 1, hp: 1 },
      { description: "Filter Feed Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Dosing Pump", hpPerUnit: null, units: 1, running: 1, standby: 0, hp: 0 },
    ],
  },

  SBR: {
    recommendation:
      "SBR (Sequencing Batch Reactor) is a modern, compact, and automated wastewater treatment system designed to efficiently and cost-effectively remove BOD, COD, and nutrients in compliance with CPCB discharge standards. Operating in batch mode, it integrates anoxic, aerobic, and settling processes within a single tank, making it highly space-efficient. So, we suggested to use the SBR technology in this STP.",
    flowChart: {
      main: [...FLOW_HEAD, "SBR TANK", ...FLOW_TAIL],
      sludgeBranchAfter: "SBR TANK",
      dosingBranchAt: "FILTERATION (PSF & ACF)",
    },
    processUnits: [
      {
        unit: "SBR Tank",
        body: "The SBR (Sequencing Batch Reactor) tank is a single, multi-functional unit in a sewage treatment plant that performs all biological treatment stages — filling, reacting (aeration), settling, decanting, and idle — in a time-based batch cycle rather than through continuous flow. By combining the functions of aeration and clarification into one tank, the SBR eliminates the need for separate aeration tanks and secondary clarifiers, resulting in a compact design that saves space and reduces mechanical complexity.",
      },
      {
        unit: "SBR Treatment Process",
        body: "The treatment process with various stages in the sequence are as follows:\n\nStage 1 — Filling: During this stage the SBR tank is filled with the influent wastewater. In order to maintain suitable F/M (food to micro-organism) ratios, the wastewater should be admitted into the tank in a rapid, controlled manner. This method functions similarly to a selector, which encourages the growth of certain micro-organisms with better settling characteristics.\n\nStage 2 — Reaction: This stage involves the utilization of biochemical oxygen demand (BOD) and ammonia nitrogen, where applicable, by micro-organisms. The length of the aeration period and the sludge mass determines the degree of treatment. The length of the aeration period depends on the strength of the wastewater and the degree of nitrification (conversion of the ammonia to a less toxic form of nitrate or nitrite) provided for in the treatment.\n\nStage 3 — Settling: During this stage, aeration is stopped and the sludge settles leaving clear, treated effluent above the sludge blanket. Duration for settling varies from 45 to 60 minutes depending on the number of cycles per day.\n\nStage 4 — Decanting: At this stage of the process effluent is removed from the tank through the decanter, without disturbing the settled sludge.\n\nStage 5 — Idling: The SBR tank waits idle until it is time to commence a new cycle with the filling stage.\n\nStage 6 — Sludge Wasting: Excess activated sludge is wasted periodically during the SBR operation. As with any activated sludge treatment process, sludge wasting is the main control of the effluent quality and micro-organism population size. This is how the operator exerts control over the effluent quality by adjusting the mixed liquor suspended solids (MLSS) concentration and the Mean Cell Residence Time (MCRT).",
      },
    ],
    equipment: [
      ...EQUIP_HEAD,
      { name: "Decanting Pump", quantity: "2 Numbers" },
      { name: "Sludge Pump", quantity: "1 Number" },
      { name: "Filter Feed Pump", quantity: "2 Numbers" },
      { name: "Control Panel", quantity: "1 Number" },
      { name: "Pressure Sand Filter vessel with Media", quantity: "1 Number" },
      { name: "Activated Carbon Filter Vessel with Media", quantity: "1 Number" },
      { name: "Dosing Tank with Dosing Pump", quantity: "1 Number" },
      ...EQUIP_TAIL,
    ],
    materialSpecs: [
      SPEC_BAR_SCREEN,
      SPEC_COLLECTION_PUMP,
      SPEC_AIR_BLOWER,
      SPEC_BLOWER_MOTOR,
      {
        title: "Decanting Pump",
        lines: [
          "Type: Monobloc Pump",
          "Model:",
          "Power Capacity: 1.5 kW / 2.0 HP",
          "Rated Discharge: 250 lpm",
          "Phase: 3 Phase (415 V)",
          "Rated Head: 10 m",
          "Max. Current: 4.5 A",
          "Pipe Size: 50 x 40 mm",
          "Make: Kirloskar / Crompton / Equivalent",
        ],
      },
      SPEC_SLUDGE_PUMP,
      SPEC_FILTER_FEED_PUMP,
      SPEC_CONTROL_PANEL,
      SPEC_PSF,
      SPEC_ACF,
      SPEC_DOSING,
      SPEC_FLOW_METER,
      ...SPEC_TAIL,
    ],
    electricalLoad: [
      { description: "Collection Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Air Blower", hpPerUnit: 5, units: 2, running: 1, standby: 1, hp: 5 },
      { description: "Decanting Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Sludge Pump", hpPerUnit: 0.6, units: 1, running: 1, standby: 0, hp: 0.6 },
      { description: "Filter Feed Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Dosing Pump", hpPerUnit: null, units: 1, running: 1, standby: 0, hp: 0 },
    ],
  },

  ASP: {
    recommendation:
      "Activated Sludge Process (ASP) is a widely adopted biological wastewater treatment technology used in Sewage Treatment Plants (STPs) to remove organic matter and suspended solids. It relies on aeration tanks where microorganisms digest pollutants in the presence of oxygen, followed by secondary clarifiers that separate the treated water from the biomass. It is most cost-effective for large-scale municipal and industrial projects (typically above 500 KLD or 1 MLD) where land availability is not a constraint and influent flow is relatively steady.",
    flowChart: {
      main: [...FLOW_HEAD, "AERATION TANK", "SETTLING TANK", ...FLOW_TAIL],
      sludgeBranchAfter: "SETTLING TANK",
      dosingBranchAt: "FILTERATION (PSF & ACF)",
    },
    processUnits: [
      {
        unit: "Aeration Tank",
        body: "The aeration tank is the core component of the Activated Sludge Process (ASP) in a Sewage Treatment Plant (STP), serving as the primary biological reactor where aerobic microorganisms break down organic pollutants. Inside the tank, wastewater is mixed with activated sludge (microbial biomass) while air or oxygen is continuously supplied via diffused aeration or mechanical aerators. This environment maintains high levels of dissolved oxygen, allowing microbes to metabolize organic matter (reducing BOD and COD) into carbon dioxide, water, and stabilized biomass. The mixture, known as Mixed Liquor Suspended Solids (MLSS), undergoes oxidation before flowing to a secondary clarifier.",
      },
      {
        unit: "Settling Tank",
        body: "Settling tanks in a Sewage Treatment Plant (STP) are critical units that use gravity to separate suspended solids from wastewater. Settling tanks follow the biological treatment stage (such as the aeration tank). They serve a dual purpose: clarification of the treated water and sludge thickening. These tanks utilize zone settling to separate the activated sludge (biomass) from the effluent. The settled biomass is partially recycled back to the aeration tank to maintain microbial concentration, while the excess is removed as waste sludge.",
      },
    ],
    equipment: [
      ...EQUIP_HEAD,
      { name: "Sludge Pump", quantity: "2 Numbers" },
      { name: "Filter Feed Pump", quantity: "2 Numbers" },
      { name: "Control Panel", quantity: "1 Number" },
      { name: "Pressure Sand Filter vessel with Media", quantity: "1 Number" },
      { name: "Activated Carbon Filter Vessel with Media", quantity: "1 Number" },
      { name: "Dosing Tank with Dosing Pump", quantity: "1 Number" },
      ...EQUIP_TAIL,
    ],
    materialSpecs: [
      SPEC_BAR_SCREEN,
      SPEC_COLLECTION_PUMP,
      SPEC_AIR_BLOWER,
      SPEC_BLOWER_MOTOR,
      SPEC_SLUDGE_PUMP,
      SPEC_FILTER_FEED_PUMP,
      SPEC_CONTROL_PANEL,
      SPEC_PSF,
      SPEC_ACF,
      SPEC_DOSING,
      SPEC_FLOW_METER,
      ...SPEC_TAIL,
    ],
    electricalLoad: [
      { description: "Collection Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Air Blower", hpPerUnit: 5, units: 2, running: 1, standby: 1, hp: 5 },
      { description: "Sludge Pump", hpPerUnit: 1, units: 2, running: 1, standby: 1, hp: 1 },
      { description: "Filter Feed Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Dosing Pump", hpPerUnit: null, units: 1, running: 1, standby: 0, hp: 0 },
    ],
  },

  MBR: {
    recommendation:
      "MBR (Membrane Bioreactor) combines conventional biological treatment with membrane filtration, replacing the secondary clarifier entirely. The membranes physically retain suspended solids, bacteria and viruses, so the permeate is consistently of reusable quality even when the incoming load varies. It occupies the smallest footprint of the four options and is the right choice where treated water is to be reused rather than discharged, since it needs no separate tertiary polishing. So, we suggested to use the MBR technology in this STP.",
    flowChart: {
      main: [...FLOW_HEAD, "AERATION TANK", "MBR TANK", "STP TREATED WATER", "FLUSHING / SAFE DISPOSAL"],
      sludgeBranchAfter: "MBR TANK",
      dosingBranchAt: "STP TREATED WATER",
    },
    processUnits: [
      {
        unit: "Aeration Tank",
        body: "The aeration tank serves as the core biological reactor where microorganisms degrade organic pollutants and perform nitrification. It fulfils a dual function: providing oxygen for biological respiration and generating scouring air to prevent membrane fouling by maintaining shear stress on the membrane surface. Fine bubble diffusers are typically used for efficient oxygen transfer to the biomass.",
      },
      {
        unit: "MBR Tank",
        body: "The MBR tank (Membrane Bioreactor tank) is the central component of the Membrane Bioreactor (MBR) wastewater treatment process, serving as the primary site for biological degradation and solid-liquid separation. It replaces the traditional secondary clarifier by using submerged microfiltration or ultrafiltration membranes to physically retain activated sludge, bacteria, and viruses, allowing only clean permeate to pass through.",
      },
    ],
    equipment: [
      ...EQUIP_HEAD,
      { name: "Sludge Pump", quantity: "2 Numbers" },
      { name: "Membrane unit", quantity: "1 Unit" },
      { name: "Control Panel", quantity: "1 Number" },
      { name: "Dosing Tank with Dosing Pump", quantity: "1 Number" },
      ...EQUIP_TAIL,
    ],
    materialSpecs: [
      SPEC_BAR_SCREEN,
      SPEC_COLLECTION_PUMP,
      SPEC_AIR_BLOWER,
      SPEC_BLOWER_MOTOR,
      SPEC_SLUDGE_PUMP,
      {
        title: "Membrane Unit",
        lines: [
          "Type:",
          "Model:",
          "Power Capacity:",
          "Rated Discharge:",
          "Phase: 3 Phase (415 V)",
          "Rated Head: 10 m",
          "Max. Current: 4.5 A",
          "Pipe Size: 50 mm",
          "Make: Dharani / Points / Equivalent",
        ],
      },
      SPEC_CONTROL_PANEL,
      SPEC_DOSING,
      SPEC_FLOW_METER,
      ...SPEC_TAIL,
    ],
    electricalLoad: [
      { description: "Collection Pump", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Air Blower", hpPerUnit: 5, units: 2, running: 1, standby: 1, hp: 5 },
      { description: "Sludge Pump", hpPerUnit: 1, units: 2, running: 1, standby: 1, hp: 1 },
      { description: "MBR Unit Pumps", hpPerUnit: 2, units: 2, running: 1, standby: 1, hp: 2 },
      { description: "Dosing Pump", hpPerUnit: null, units: 1, running: 1, standby: 0, hp: 0 },
    ],
  },
};

/** The technologies that have a Project Report document variant. Deliberately NOT
 *  the full `TECHNOLOGIES` list — SAFF and DAF have no sample document, so the
 *  request/create forms only offer these four for a Project Proposal. */
export const PROJECT_REPORT_TECHNOLOGIES = ["MBBR", "SBR", "ASP", "MBR"] as const;
export type ProjectReportTechnology = (typeof PROJECT_REPORT_TECHNOLOGIES)[number];

export function projectReportTemplate(technology: string): ProjectReportTemplate {
  return PROJECT_REPORT_TEMPLATES[technology] ?? PROJECT_REPORT_TEMPLATES.MBBR;
}

/** Full ordered process-unit list for a technology (shared pre + tech + shared post). */
export function processUnitsFor(technology: string): ProcessUnit[] {
  return [...PROCESS_UNITS_PRE, ...projectReportTemplate(technology).processUnits, ...PROCESS_UNITS_POST];
}
