"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/money";
import {
  PROPOSAL_TYPES,
  PLANT_TYPES,
  PROPOSAL_TYPE_HINTS,
  TECHNOLOGY_ONE_LINERS,
} from "@/lib/constants";
import {
  PROJECT_REPORT_TECHNOLOGIES,
  projectReportTemplate,
} from "@/lib/project-report-templates";
import {
  PROJECT_REPORT_COST_BUCKETS,
  PROJECT_REPORT_PLANT_TYPES,
  DEFAULT_AMC_CHARGE_LINES,
} from "@/lib/project-report-boilerplate";
import {
  computeCapacity,
  computeLoadTotals,
  DEFAULT_AMC_TERM_MONTHS,
  DEFAULT_AMC_FREQUENCY,
  DEFAULT_AMC_VISITS_PER_YEAR,
} from "@/lib/domain/proposal-document";
import { createProposalFromWizardAction } from "./actions";

export interface WizardLead {
  id: string;
  customerName: string;
  address: string;
  projectName: string | null;
  projectAddress: string | null;
  plantType: string | null;
  technology: string | null;
  capacityKLD: number | null;
  capacityValue: number | null;
  capacityUnit: string | null;
  segment: string | null;
  existingTypes: string[];
}

/**
 * One priced line.
 *
 * `amount` is what the Project Report and BOQ quote directly (a lump sum per line).
 * The AMC and the Service proforma both quote a UNIT and a RATE instead — an AMC's
 * table reads "per month × months", the proforma's reads "quantity × rate per
 * quantity" — so for those two the amount is DERIVED and never typed, which is what
 * keeps the printed table and the stored subtotal the same numbers.
 */
interface CostLine {
  item: string;
  amount: string;
  qty?: string;
  rate?: string;
}

/** The line's effective value, whichever way this proposal type is priced. */
function lineAmount(l: CostLine, derived: boolean): number {
  if (!derived) return Number(l.amount) || 0;
  return (Number(l.qty) || 0) * (Number(l.rate) || 0);
}

const GST_RATE = 18;

/**
 * The admin's proposal creation flow: Enquiry → Format → Details → Pricing → Preview.
 *
 * Only the fields that genuinely differ per type are asked for. A Project Report
 * collects the §6.1 capacity calculation and the four rolled-up cost buckets; a BOQ
 * collects an itemised machinery estimate; Service/AMC collect a free-text scope
 * until the client supplies those formats.
 *
 * Everything else the document needs — the technology write-up, process flow,
 * equipment tables, spec sheets, boilerplate — is seeded server-side from the
 * template layer at creation, so this form stays short instead of asking the admin
 * to retype content that never changes.
 */
export function NewProposalWizard({
  leads,
  initialLeadId,
  initialType,
  initialTechnology,
  initialPlantType,
  requestId,
  requestNotes,
}: {
  leads: WizardLead[];
  initialLeadId: string;
  initialType: string;
  initialTechnology: string | null;
  initialPlantType: string | null;
  requestId: string | null;
  requestNotes: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);

  const [leadId, setLeadId] = useState(initialLeadId);
  const [proposalType, setProposalType] = useState(initialType);
  const [technology, setTechnology] = useState(initialTechnology ?? "MBBR");
  const [plantType, setPlantType] = useState(initialPlantType ?? "STP");

  const lead = leads.find((l) => l.id === leadId) ?? null;
  const isProjectReport = proposalType === "Project Proposal";
  const isBoq = proposalType === "BOQ Proposal";

  // §6.1 capacity calculation.
  const [people, setPeople] = useState("");
  const [usagePerHead, setUsagePerHead] = useState("45");
  const [factorOfSafety, setFactorOfSafety] = useState("");
  const capacity = computeCapacity({
    people: Number(people) || 0,
    usagePerHead: Number(usagePerHead) || 0,
    factorOfSafety: Number(factorOfSafety) || 0,
  });

  // §10.1 — the Project Report's four rolled-up lines, or the BOQ's itemised table.
  const [costLines, setCostLines] = useState<CostLine[]>(
    PROJECT_REPORT_COST_BUCKETS.map((b) => ({ item: b, amount: "" })),
  );
  const [summary, setSummary] = useState(requestNotes ?? "");
  // AMC terms — these build the actual ServiceContract on Won, so they're not
  // decorative: term and visits/year determine the maintenance visit schedule.
  const isAmc = proposalType === "AMC Proposal";
  const isService = proposalType === "Service Proposal";
  const [amc, setAmc] = useState({
    termMonths: String(DEFAULT_AMC_TERM_MONTHS),
    frequency: DEFAULT_AMC_FREQUENCY as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY",
    visitsPerYear: String(DEFAULT_AMC_VISITS_PER_YEAR),
    mechanical: "",
    electrical: "",
    chemical: "",
    consumablesIncluded: "",
    exclusions: "",
  });
  const [secondPlant, setSecondPlant] = useState({
    plantType: "",
    capacityValue: "",
    capacityUnit: "KLD",
  });
  const [service, setService] = useState({
    jobDescription: "",
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  });

  // AMC and Service price by unit × rate; everything else by a typed amount.
  const derivedPricing = isAmc || isService;
  const subtotal = costLines.reduce((a, l) => a + lineAmount(l, derivedPricing), 0);
  const gst = Math.round(subtotal * GST_RATE) / 100;
  const grand = subtotal + gst;

  const loadPreview = useMemo(() => {
    if (!isProjectReport) return null;
    const tpl = projectReportTemplate(technology);
    return tpl ? computeLoadTotals(tpl.electricalLoad) : null;
  }, [isProjectReport, technology]);

  /** When the format changes, reset the cost table to that format's natural shape. */
  function pickType(next: string) {
    setProposalType(next);
    // A plant type with no Project Report copy can't carry that format.
    if (next === "Project Proposal" && !PROJECT_REPORT_PLANT_TYPES.includes(plantType as never)) {
      setPlantType("STP");
    }
    setCostLines(
      next === "Project Proposal"
        ? PROJECT_REPORT_COST_BUCKETS.map((b) => ({ item: b, amount: "" }))
        : next === "AMC Proposal"
          ? // The four lines every AMC in the client's sample quotes, as editable
            // defaults. Rates are deliberately blank — a per-month figure is per-deal,
            // and seeding a number would fabricate a price (the v38 ₹0 lesson).
            DEFAULT_AMC_CHARGE_LINES.map((l) => ({
              item: l.description,
              amount: "",
              qty: String(DEFAULT_AMC_TERM_MONTHS),
              rate: "",
            }))
          : next === "Service Proposal"
            ? [{ item: "", amount: "", qty: "1", rate: "" }]
            : [{ item: "", amount: "" }],
    );
  }

  function pickLead(id: string) {
    setLeadId(id);
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    if (l.plantType) setPlantType(l.plantType);
    if (l.technology && PROJECT_REPORT_TECHNOLOGIES.includes(l.technology as never)) setTechnology(l.technology);
    // Deliberately NOT back-filling people/factor-of-safety from the lead's KLD.
    // §6.1 prints the headcount as a stated fact about the customer's site, and
    // deriving it from a capacity that was itself estimated would be circular — an
    // invented figure an admin could click straight past. Only the industry-standard
    // 45 lpd/head is offered; the real basis has to be typed.
  }

  const alreadyQuoted = !!lead && lead.existingTypes.includes(proposalType);
  const canAdvance =
    step === 0 ? !!leadId && !alreadyQuoted : step === 1 ? true : step === 2 ? true : true;

  const STEPS = [
    "Enquiry & format",
    isProjectReport ? "Design basis" : isAmc ? "Contract terms" : "Details",
    "Pricing",
    "Preview",
  ];

  function submit() {
    if (!lead) return;
    start(async () => {
      try {
        const res = await createProposalFromWizardAction({
          leadId: lead.id,
          proposalType,
          technology: isProjectReport ? technology : undefined,
          plantType,
          requestId: requestId ?? undefined,
          capacityCalc: isProjectReport
            ? {
                people: Number(people) || undefined,
                usagePerHead: Number(usagePerHead) || undefined,
                factorOfSafety: Number(factorOfSafety) || undefined,
              }
            : undefined,
          summary: !isProjectReport && !isBoq ? summary.trim() || undefined : undefined,
          amc: isAmc
            ? {
                termMonths: Number(amc.termMonths) || undefined,
                frequency: amc.frequency,
                visitsPerYear: Number(amc.visitsPerYear) || undefined,
                scope: {
                  mechanical: amc.mechanical.trim() || undefined,
                  electrical: amc.electrical.trim() || undefined,
                  chemical: amc.chemical.trim() || undefined,
                  consumablesIncluded: amc.consumablesIncluded.trim() || undefined,
                  exclusions: amc.exclusions.trim() || undefined,
                },
                additionalPlants: secondPlant.plantType
                  ? [
                      {
                        plantType: secondPlant.plantType,
                        capacityValue: Number(secondPlant.capacityValue) || undefined,
                        capacityUnit: secondPlant.capacityUnit.trim() || "KLD",
                      },
                    ]
                  : undefined,
              }
            : undefined,
          service: isService
            ? { jobDescription: service.jobDescription.trim() || undefined, priority: service.priority }
            : undefined,
          costLines: costLines
            .filter((l) => l.item.trim() && lineAmount(l, derivedPricing) > 0)
            .map((l) => ({
              item: l.item.trim(),
              amount: lineAmount(l, derivedPricing),
              // Only sent for the unit-priced formats, so the printed AMC table can
              // show "₹75,000 × 12 Month" and the proforma "2 Nos × ₹1,500".
              ...(derivedPricing
                ? { qty: Number(l.qty) || 1, rate: Number(l.rate) || 0, unit: isAmc ? "Month" : "No" }
                : {}),
            })),
        });
        toast(res.already ? "That proposal already existed — opening it." : "Proposal created.");
        router.push(`/proposals/${res.proposalId}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not create the proposal", "error");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Step rail */}
      <ol className="mb-4 flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold " +
                (i < step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i === step
                    ? "border-primary bg-primary-50 text-primary ring-4 ring-primary/15"
                    : "border-border bg-surface text-muted")
              }
            >
              {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={"hidden text-xs sm:block " + (i === step ? "font-semibold" : "text-muted")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-0.5 flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {/* ---------- Step 0: enquiry + format ---------- */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Which enquiry, and which document?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Enquiry" required>
              <Select value={leadId} onChange={(e) => pickLead(e.target.value)} autoFocus>
                <option value="">Select an enquiry…</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.customerName} — {l.address}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Document format" required hint={PROPOSAL_TYPE_HINTS[proposalType]}>
              <Select value={proposalType} onChange={(e) => pickType(e.target.value)}>
                {PROPOSAL_TYPES.map((t) => (
                  <option key={t} value={t} disabled={lead?.existingTypes.includes(t)}>
                    {t}
                    {lead?.existingTypes.includes(t) ? " — already quoted" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* A Project Report only has document copy for STP/ETP/WTP. Offering RO or
                  OWC here would print "A Sewage Treatment Plant (STP) is…" under an RO
                  heading — same class as the SAFF→MBBR substitution fixed in v45. Other
                  plant types are still quotable via the BOQ/Service/AMC formats. */}
              <Field
                label="Plant type"
                hint={
                  isProjectReport
                    ? "A Project Report is available for STP, ETP and WTP. For other plants use a BOQ proposal."
                    : undefined
                }
              >
                <Select value={plantType} onChange={(e) => setPlantType(e.target.value)}>
                  {(isProjectReport ? PROJECT_REPORT_PLANT_TYPES : PLANT_TYPES).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              {isProjectReport && (
                <Field label="Technology" required hint={TECHNOLOGY_ONE_LINERS[technology]}>
                  <Select value={technology} onChange={(e) => setTechnology(e.target.value)}>
                    {PROJECT_REPORT_TECHNOLOGIES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            {isProjectReport && (
              <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted">
                The {technology} process description, flow chart, equipment list, specification sheet and
                electrical load table are filled in automatically from the standard {technology} document —
                all editable afterwards.
              </p>
            )}
            {alreadyQuoted && (
              <p className="text-sm text-danger">
                This enquiry already has a {proposalType}. Pick a different format, or open the existing one.
              </p>
            )}
            {requestNotes && (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  What the field team asked for
                </span>
                <p className="mt-1 whitespace-pre-wrap">{requestNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- Step 1: design basis (Project Report) / details ---------- */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{isProjectReport ? "Design basis" : "Details"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProjectReport ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Number of people" hint="Across all shifts">
                    <Input type="number" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="500" />
                  </Field>
                  <Field label="Water usage per head" hint="Litres per day">
                    <Input
                      type="number"
                      value={usagePerHead}
                      onChange={(e) => setUsagePerHead(e.target.value)}
                      placeholder="45"
                    />
                  </Field>
                  <Field label="Factor of safety" hint="Extra litres per day">
                    <Input
                      type="number"
                      value={factorOfSafety}
                      onChange={(e) => setFactorOfSafety(e.target.value)}
                      placeholder="7500"
                    />
                  </Field>
                </div>

                <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <CalcRow label="Sewage generated per day" value={`${capacity.sewagePerDay.toLocaleString("en-IN")} litres`} />
                  <CalcRow label="Factor of safety" value={`${(Number(factorOfSafety) || 0).toLocaleString("en-IN")} litres`} />
                  <CalcRow
                    label="Total design capacity"
                    value={`${capacity.designCapacityLPD.toLocaleString("en-IN")} litres per day ≈ ${capacity.designCapacityKLD} KLD`}
                    bold
                  />
                </div>

                {loadPreview && (
                  <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      Electrical load (from the {technology} standard, editable later)
                    </div>
                    <CalcRow label="Running capacity" value={`${loadPreview.hp} HP`} />
                    <CalcRow label="Factor of safety 10%" value={`${loadPreview.factorOfSafetyHp} HP`} />
                    <CalcRow label="Power supply required" value={`${loadPreview.requiredHp} HP ≈ ${loadPreview.supplyKw} kW`} bold />
                  </div>
                )}
              </>
            ) : isAmc ? (
              <>
                <p className="text-sm text-muted">
                  Prints as the AMC Quotation. These also build the actual maintenance contract when
                  the proposal is won — the term and visits per year generate its visit schedule.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Contract term" hint="Months">
                    <Input
                      type="number"
                      value={amc.termMonths}
                      onChange={(e) => {
                        const months = e.target.value;
                        setAmc({ ...amc, termMonths: months });
                        // Every charge line is quoted per month FOR THE TERM, so the
                        // months column follows the term. Leaving it at 12 while the
                        // contract says 24 would print totals that don't match it.
                        setCostLines((rows) => rows.map((r) => ({ ...r, qty: months })));
                      }}
                    />
                  </Field>
                  <Field label="Visit frequency">
                    <Select
                      value={amc.frequency}
                      onChange={(e) => {
                        const frequency = e.target.value as typeof amc.frequency;
                        // Keep visits/year consistent with the frequency chosen, but let
                        // it be overridden — some contracts buy extra visits.
                        const perYear = { MONTHLY: 12, QUARTERLY: 4, HALF_YEARLY: 2, YEARLY: 1 }[frequency];
                        setAmc({ ...amc, frequency, visitsPerYear: String(perYear) });
                      }}
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="HALF_YEARLY">Half-yearly</option>
                      <option value="YEARLY">Yearly</option>
                    </Select>
                  </Field>
                  <Field label="Visits per year">
                    <Input
                      type="number"
                      value={amc.visitsPerYear}
                      onChange={(e) => setAmc({ ...amc, visitsPerYear: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                  Winning this creates an AMC contract with{" "}
                  <strong>
                    {Math.max(
                      1,
                      Math.round(((Number(amc.termMonths) || 12) / 12) * (Number(amc.visitsPerYear) || 4)),
                    )}
                  </strong>{" "}
                  scheduled maintenance visits.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["mechanical", "Mechanical scope"],
                      ["electrical", "Electrical scope"],
                      ["chemical", "Chemical / consumables"],
                      ["consumablesIncluded", "Consumables included"],
                      ["exclusions", "Exclusions"],
                    ] as const
                  ).map(([k, label]) => (
                    <Field key={k} label={label}>
                      <Textarea
                        className="min-h-16 text-sm"
                        value={amc[k]}
                        onChange={(e) => setAmc({ ...amc, [k]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">A second plant on the same contract</div>
                      <div className="text-xs text-muted">
                        Optional. Their sample AMC covers an STP and an ETP together — leave blank for
                        a single-plant contract.
                      </div>
                    </div>
                    {!secondPlant.plantType && (
                      <Button variant="ghost" size="sm" onClick={() => setSecondPlant({ ...secondPlant, plantType: "ETP" })}>
                        <Plus className="size-4" /> Add
                      </Button>
                    )}
                  </div>
                  {secondPlant.plantType && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Plant type">
                        <Select
                          value={secondPlant.plantType}
                          onChange={(e) => setSecondPlant({ ...secondPlant, plantType: e.target.value })}
                        >
                          {PLANT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Capacity">
                        <Input
                          type="number"
                          value={secondPlant.capacityValue}
                          onChange={(e) => setSecondPlant({ ...secondPlant, capacityValue: e.target.value })}
                        />
                      </Field>
                      <Field label="Unit">
                        <Input
                          value={secondPlant.capacityUnit}
                          onChange={(e) => setSecondPlant({ ...secondPlant, capacityUnit: e.target.value })}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </>
            ) : isService ? (
              <>
                <p className="text-sm text-muted">
                  Prints as a one-page Proforma Invoice. Winning it books the job in the Service
                  module, carrying its quoted value.
                </p>
                <Field label="What is the job?" hint="Becomes the service job's description.">
                  <Textarea
                    className="min-h-28"
                    value={service.jobDescription}
                    onChange={(e) => setService({ ...service, jobDescription: e.target.value })}
                    placeholder="e.g. replace the aeration blower and re-commission the plant"
                  />
                </Field>
                <Field label="Priority" hint="Sets the response SLA once the job is booked.">
                  <Select
                    value={service.priority}
                    onChange={(e) => setService({ ...service, priority: e.target.value as typeof service.priority })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </Select>
                </Field>
              </>
            ) : isBoq ? (
              <p className="text-sm text-muted">
                A BOQ proposal is priced line by line — add the machinery items on the next step. The
                estimate title and headings are set up for you and can be edited afterwards.
              </p>
            ) : (
              <Field
                label="Scope"
                hint="What this covers. This type has no document format of its own, so it prints in the general proposal layout."
              >
                <Textarea
                  className="min-h-32"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Describe what this proposal covers…"
                />
              </Field>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- Step 2: pricing ---------- */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{isProjectReport ? "Financial proposal" : "Pricing"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR className="border-t-0">
                  <TH>{isProjectReport ? "Details" : "Description"}</TH>
                  {derivedPricing && (
                    <>
                      <TH className="text-right">{isAmc ? "Per month ₹" : "Rate ₹"}</TH>
                      <TH className="text-center">{isAmc ? "Months" : "Qty"}</TH>
                    </>
                  )}
                  <TH className="text-right">{derivedPricing ? "Total ₹" : "Amount ₹"}</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {costLines.map((l, i) => (
                  <TR key={i}>
                    <TD>
                      <Input
                        className="h-8"
                        value={l.item}
                        aria-label={`Line ${i + 1} description`}
                        onChange={(e) =>
                          setCostLines((rows) => rows.map((r, j) => (j === i ? { ...r, item: e.target.value } : r)))
                        }
                      />
                    </TD>
                    {derivedPricing ? (
                      <>
                        <TD className="text-right">
                          <Input
                            className="h-8 w-28 text-right"
                            type="number"
                            value={l.rate ?? ""}
                            aria-label={`Line ${i + 1} ${isAmc ? "per-month charge" : "rate"}`}
                            onChange={(e) =>
                              setCostLines((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, rate: e.target.value } : r)),
                              )
                            }
                          />
                        </TD>
                        <TD className="text-center">
                          <Input
                            className="h-8 w-20 text-center"
                            type="number"
                            value={l.qty ?? ""}
                            aria-label={`Line ${i + 1} ${isAmc ? "months" : "quantity"}`}
                            onChange={(e) =>
                              setCostLines((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)),
                              )
                            }
                          />
                        </TD>
                        {/* Derived, never typed — so the printed table and the stored
                            subtotal can't disagree. */}
                        <TD className="text-right text-sm tabular-nums">
                          {formatINR(lineAmount(l, true))}
                        </TD>
                      </>
                    ) : (
                      <TD className="text-right">
                        <Input
                          className="h-8 w-32 text-right"
                          type="number"
                          value={l.amount}
                          aria-label={`Line ${i + 1} amount`}
                          onChange={(e) =>
                            setCostLines((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))
                          }
                        />
                      </TD>
                    )}
                    <TD>
                      <button
                        aria-label="Remove line"
                        onClick={() => setCostLines((rows) => rows.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4 text-danger" />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() =>
                setCostLines((rows) => [
                  ...rows,
                  derivedPricing
                    ? { item: "", amount: "", qty: isAmc ? amc.termMonths : "1", rate: "" }
                    : { item: "", amount: "" },
                ])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>

            <div className="mt-3 border-t border-border pt-3 text-sm">
              <CalcRow label="Total" value={formatINR(subtotal)} />
              <CalcRow label="GST 18%" value={formatINR(gst)} />
              <CalcRow label="Total amount" value={formatINR(grand)} bold />
            </div>
            <p className="mt-2 text-xs text-muted">
              Payment terms default to the standard 50/30/20 milestones and can be changed in the editor
              before sending.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Step 3: preview ---------- */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Check before creating</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <CalcRow label="Customer" value={lead?.customerName ?? "—"} />
            <CalcRow label="Site" value={lead?.projectAddress || lead?.address || "—"} />
            <CalcRow label="Document" value={proposalType} />
            {isProjectReport && <CalcRow label="Technology" value={technology} />}
            <CalcRow label="Plant type" value={plantType} />
            {isProjectReport && (
              <CalcRow
                label="Design capacity"
                value={
                  capacity.designCapacityLPD > 0
                    ? `${capacity.designCapacityLPD.toLocaleString("en-IN")} LPD ≈ ${capacity.designCapacityKLD} KLD`
                    : "Not calculated"
                }
              />
            )}
            <CalcRow label="Priced lines" value={String(costLines.filter((l) => lineAmount(l, derivedPricing) > 0).length)} />
            <CalcRow label="Total with GST" value={formatINR(grand)} bold />
            <p className="pt-2 text-xs text-muted">
              The proposal is created as a draft. It stays inside the office until you approve and send
              it — only then does the field team see it.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Nav ---------- */}
      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="size-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button size="sm" disabled={pending || !lead} onClick={submit}>
            <FileText className="size-4" /> {pending ? "Creating…" : "Create proposal"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CalcRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between gap-3 " + (bold ? "font-semibold" : "text-muted")}>
      <span>{label}</span>
      <span className="text-right tabular-nums text-foreground">{value}</span>
    </div>
  );
}
