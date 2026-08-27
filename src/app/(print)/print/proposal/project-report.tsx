import { formatDocRs, amountInWords } from "@/lib/money";
import {
  asProjectReportData,
  computeCapacity,
  computeLoadTotals,
  HP_TO_KW,
} from "@/lib/domain/proposal-document";
import { TECHNOLOGY_COMPARISON, specTitleWithQty } from "@/lib/project-report-templates";
import {
  shouldPrintStandardTerms,
  resolvePointsToNote,
  PLANT_TYPE_ABOUT,
  DEFAULT_DOC_FORCE_MAJEURE,
  documentRefNo,
} from "@/lib/project-report-boilerplate";
import {
  DocSection,
  DocProse,
  ParameterTable,
  ProcessFlowChart,
  docCell,
  docHeadCell,
  docH3,
  docP,
  avoidBreak,
  pageBreak,
  BRAND,
} from "@/components/print/doc-primitives";
import { DocCover, DocSignature, endStop } from "@/components/print/doc-cover";
import type { ProposalPrintData } from "./print-data";

/**
 * The Project Report — Green Ecocare's 15-section engineered proposal, matching the
 * structure of their real sample documents.
 *
 * Content comes from three places, exactly as Phase B set up:
 *   • per-technology engineering  → `version.documentData` (seeded from the template,
 *                                    then this proposal's own editable copy)
 *   • company boilerplate         → `company.doc.*` (Settings → Proposal document)
 *   • per-deal money              → BOQItem rows + paymentTerms
 *
 * A section with no data is omitted rather than printed empty — a proposal created
 * before Phase B, or one for a technology with no template (SAFF/DAF), still renders
 * a valid if shorter document.
 *
 * The Table of Contents is a static section list with NO page numbers: HTML→PDF cannot
 * resolve real ones. (The client's own TOC is wrong anyway — it lists Recent Projects
 * on p.22 of a 16-page document.)
 */
export function ProjectReportDocument({ p, v, company }: ProposalPrintData) {
  const doc = asProjectReportData(v?.documentData);
  const capacity = computeCapacity(doc.capacityCalc);
  const boq = v?.boqItems ?? [];
  const terms = (v?.paymentTerms ?? []) as Array<{ description: string; percent: number }>;
  const load = (v?.electricalLoad ?? []) as {
    description: string;
    hp: number;
    hpPerUnit?: number | null;
    units?: number | null;
    running?: number | null;
    standby?: number | null;
  }[];
  const loadTotals = computeLoadTotals(load, doc.loadFactorOfSafetyPct ?? 10);

  // Prefer the capacity the admin actually calculated; fall back to the lead's sizing.
  const kld = capacity.designCapacityKLD || p.capacityKLD;
  const lpd = capacity.designCapacityLPD || Math.round(p.capacityKLD * 1000);
  const plantName = plantLabel(p.plantType);

  const subtotal = Number(v?.subtotal ?? 0);
  const gstAmount = Number(v?.gstAmount ?? 0);
  const grandTotal = Number(v?.grandTotal ?? 0);

  const tcs = typeof v?.terms === "string" ? v.terms : "";
  const printTcs = shouldPrintStandardTerms({
    proposalType: p.proposalType,
    terms: tcs,
    companyTemplate: company.standardTermsTemplate,
  });
  const pointsToNote = resolvePointsToNote(v?.pointsToNote, company.doc.pointsToNote);
  const scope = (v?.scopeOfWork ?? {}) as Record<string, string>;
  const legacySpecs = (v?.technicalSpecs ?? []) as { section: string; item: string; spec: string; qty: string }[];

  const sections = [
    "Cover Letter",
    "Greetings",
    "Table of Contents",
    "Introduction",
    "Plant / Product Details",
    "Design of Plant / Product",
    "Civil Design",
    "MEP Design",
    "Electrical Load Calculation",
    "Financial Proposal",
    "Supply, Erection, Commissioning & Takeover",
    "Warranty Details",
    "Scope of Work by Green Ecocare",
    "Scope of Work for the Client",
    "Our Recent Completed Plants in the Projects",
  ];

  return (
    <>
      <DocCover
        refNo={documentRefNo(p.number, p.proposalType, p.plantType)}
        date={p.createdAt}
        title={`Proposal for the ${plantName} (Capacity ${lpd || "—"} liters per day) for ${p.projectName} at ${endStop(p.siteAddress)}`}
        company={company}
        customerName={p.customerName}
        customerAddress={p.siteAddress}
        kindAttn={p.kindAttn}
      />

      {/* ---- Greetings / cover letter ---- */}
      {v?.coverLetter && (
        <section style={{ ...pageBreak, pageBreakAfter: "always" }}>
          {/* Their heading uses the trading name, not the registered one:
              "Greetings from Green Ecocare", never "…Private Limited". */}
          <h2 style={{ color: BRAND, fontSize: 16, marginBottom: 12 }}>
            Greetings from {tradingName(company.name)}
          </h2>
          <DocProse text={v.coverLetter} />
          <DocSignature
            company={company}
            signatoryName={company.doc.signatoryName}
            signatoryTitle={company.doc.signatoryTitle}
            signatoryPhone={company.doc.signatoryPhone}
          />
        </section>
      )}

      {/* ---- Plant illustration (v40's AI image; the pre-Phase-C layout printed it) ---- */}
      {v?.heroImageUrl && (
        <section style={{ ...pageBreak, pageBreakAfter: "always", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by headless Chromium into a PDF, not the Next image pipeline */}
          <img
            src={v.heroImageUrl}
            alt=""
            style={{ width: "100%", maxHeight: "16cm", objectFit: "contain", display: "block" }}
          />
        </section>
      )}

      {/* ---- Table of Contents ---- */}
      <section style={{ ...pageBreak, pageBreakAfter: "always" }}>
        <h2 style={{ color: BRAND, fontSize: 16, marginBottom: 12 }}>Table of Contents</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {sections.map((s, i) => (
              <tr key={s}>
                <td style={{ ...docCell, width: 44, textAlign: "center" }}>{i + 1}.</td>
                <td style={docCell}>{s}</td>
                {/* Filled in by the renderer AFTER a measurement pass — see the
                    outline logic in lib/pdf.ts. The width is reserved so writing a
                    number into it cannot reflow the document and invalidate the very
                    page numbers being written. `data-toc-entry` is the 1-based TOC
                    row, which matches the section number for §4 onwards. */}
                <td
                  data-toc-entry={i + 1}
                  style={{ ...docCell, width: 56, textAlign: "right" }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- 4. Introduction / 5. Plant ---- */}
      <DocSection no={4} title="Introduction">
        <DocProse text={company.doc.introduction} />
      </DocSection>

      <DocSection no={5} title={plantName}>
        {/* The company's edited override wins; otherwise the copy for THIS plant type,
            so an ETP/WTP proposal never opens "A Sewage Treatment Plant (STP) is…". */}
        <DocProse text={company.doc.plantAboutOverride ?? PLANT_TYPE_ABOUT[p.plantType] ?? company.doc.plantAbout} />
      </DocSection>

      {/* ---- 6. Process design ---- */}
      <DocSection no={6} title="Process Design of the Plant">
        {(doc.capacityCalc?.people || capacity.designCapacityLPD > 0) && (
          <div style={avoidBreak}>
            <div style={docH3}>6.1 Plant Capacity Calculation:</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <tbody>
                {doc.capacityCalc?.people ? (
                  <CalcRow label="Total number of people working in all 3 shifts" value={`${doc.capacityCalc.people.toLocaleString("en-IN")} people per day`} />
                ) : null}
                {doc.capacityCalc?.usagePerHead ? (
                  <CalcRow label="Water usage per head" value={`${doc.capacityCalc.usagePerHead} liters per day`} />
                ) : null}
                <CalcRow label="Sewage generated per day" value={`${capacity.sewagePerDay.toLocaleString("en-IN")} liters per day`} />
                {doc.capacityCalc?.factorOfSafety ? (
                  <CalcRow label="Factor of safety" value={`${doc.capacityCalc.factorOfSafety.toLocaleString("en-IN")} liters`} />
                ) : null}
                <CalcRow label="Total design capacity" value={`${capacity.designCapacityLPD.toLocaleString("en-IN")} liters per day`} bold />
              </tbody>
            </table>
            <p style={docP}>
              So let us design a {plantName.toLowerCase()} which can hold{" "}
              {capacity.designCapacityLPD.toLocaleString("en-IN")} LPD ≈ {capacity.designCapacityKLD} KLD.
            </p>
          </div>
        )}

        {(doc.inletParameters?.length || doc.outletParameters?.length) && (
          <div style={{ ...avoidBreak, marginBottom: 10 }}>
            <ParameterTable heading="6.2 The Expected Inlet Parameters:" rows={doc.inletParameters ?? []} />
            <ParameterTable heading="6.3 The Anticipated Final Water Quality:" rows={doc.outletParameters ?? []} />
          </div>
        )}

        <div style={docH3}>6.4 Choosing the Process by Given Data:</div>
        <p style={docP}>
          {plantName}s treat {p.plantType === "WTP" ? "raw water" : "domestic and industrial sewage"} to
          make it {p.plantType === "WTP" ? "fit for its intended use" : "reusable or safe for discharge"}.
          Choosing the right technology ensures efficient treatment, compliance with environmental
          norms, and reduced operational costs. The most common technologies are:
        </p>
        <ol style={{ fontSize: 12.5, lineHeight: 1.6, paddingLeft: 20, marginBottom: 8, listStyleType: "decimal" }}>
          {TECHNOLOGY_COMPARISON.map((t) => (
            <li key={t.key} style={{ marginBottom: 5 }}>
              <strong>{t.name}:</strong> {t.body}
            </li>
          ))}
        </ol>
        {doc.recommendation && <p style={docP}>{doc.recommendation}</p>}
        {/* The technology explainer (seeded from TECHNOLOGY_EXPLAINERS specifically for
            this document) belongs INSIDE §6.4, after the recommendation — the samples
            have no separate "About X" section, and inventing one would make the section
            numbers shift depending on whether the field happens to be filled. */}
        {v?.technologyExplainer && (
          <>
            <div style={{ ...docH3, marginTop: 8 }}>About {p.technology}</div>
            <DocProse text={v.technologyExplainer} />
          </>
        )}

        {(doc.flowChart?.length ?? 0) > 0 && (
          <ProcessFlowChart
            title={`6.5 Process Flow Chart — ${capacity.designCapacityKLD || kld} KLD ${p.technology}`}
            nodes={doc.flowChart ?? []}
            sludgeBranchAfter={doc.sludgeBranchAfter}
            dosingBranchAt={doc.dosingBranchAt}
          />
        )}

        {(doc.processUnits?.length ?? 0) > 0 && (
          <div>
            <div style={docH3}>6.6 Details of Process:</div>
            {(doc.processUnits ?? []).map((u, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{u.unit}:</div>
                <DocProse text={u.body} />
              </div>
            ))}
          </div>
        )}
        {/* The AI "Technical Write-up" the editor exposes — printed, not orphaned. */}
        {v?.technicalText && (
          <div>
            <div style={docH3}>6.7 Design Notes:</div>
            <DocProse text={v.technicalText} />
          </div>
        )}
      </DocSection>

      {/* ---- 7. Civil / 8. MEP ---- */}
      <DocSection no={7} title="Civil Design">
        <DocProse text={company.doc.civilDesign} />
      </DocSection>

      <DocSection no={8} title="MEP Design">
        <DocProse text={company.doc.mepDesign} />

        {(doc.equipment?.length ?? 0) > 0 && (
          <div style={avoidBreak}>
            <div style={docH3}>8.1 Machinery and Equipment used for the Plant:</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...docHeadCell, width: 50, textAlign: "center" }}>S. No</th>
                  <th style={docHeadCell}>Name</th>
                  <th style={{ ...docHeadCell, width: 130 }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {(doc.equipment ?? []).map((e, i) => (
                  <tr key={i}>
                    <td style={{ ...docCell, textAlign: "center" }}>{i + 1}</td>
                    <td style={docCell}>{e.name}</td>
                    <td style={docCell}>{e.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legacy fallback: proposals created before Phase B carry v29's technicalSpecs
            table and no documentData.materialSpecs. Print that rather than nothing. */}
        {(doc.materialSpecs?.length ?? 0) === 0 && legacySpecs.length > 0 && (
          <div style={avoidBreak}>
            <div style={docH3}>8.2 Specifications of the Equipment:</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={docHeadCell}>Section</th>
                  <th style={docHeadCell}>Item</th>
                  <th style={docHeadCell}>Specification</th>
                  <th style={{ ...docHeadCell, textAlign: "right" }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {legacySpecs.map((r, i) => (
                  <tr key={i}>
                    <td style={docCell}>{r.section}</td>
                    <td style={docCell}>{r.item}</td>
                    <td style={docCell}>{r.spec}</td>
                    <td style={num}>{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(doc.materialSpecs?.length ?? 0) > 0 && (
          <div>
            <div style={docH3}>8.2 Specifications of the Equipment:</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...docHeadCell, width: 50, textAlign: "center" }}>S. No</th>
                  <th style={docHeadCell}>Description</th>
                </tr>
              </thead>
              <tbody>
                {(doc.materialSpecs ?? []).map((m, i) => (
                  <tr key={i} style={avoidBreak}>
                    <td style={{ ...docCell, textAlign: "center", verticalAlign: "top" }}>{i + 1}</td>
                    <td style={docCell}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {specTitleWithQty(m.title, doc.equipment ?? [])}
                      </div>
                      {m.lines.filter(Boolean).map((l, j) => (
                        <div key={j} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                          {l}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DocSection>

      {/* ---- 9. Electrical load ---- */}
      {load.length > 0 && (
        <DocSection no={9} title="Electrical Load Calculation">
          <table style={{ ...avoidBreak, width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={{ ...docHeadCell, width: 44, textAlign: "center" }}>Sl. No</th>
                <th style={docHeadCell}>Machinery / Equipment</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>Power of Unit (HP)</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>No of Unit</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>Running Unit</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>Stand by Unit</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>Power of running capacity (HP)</th>
              </tr>
            </thead>
            <tbody>
              {load.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...docCell, textAlign: "center" }}>{i + 1}</td>
                  <td style={docCell}>{r.description}</td>
                  <td style={num}>{r.hpPerUnit ?? ""}</td>
                  <td style={num}>{r.units ?? ""}</td>
                  <td style={num}>{r.running ?? ""}</td>
                  <td style={num}>{r.standby ?? ""}</td>
                  <td style={num}>{r.hp || ""}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...docCell, fontWeight: 700 }} colSpan={3}>
                  Total
                </td>
                <td style={{ ...num, fontWeight: 700 }}>{loadTotals.units}</td>
                <td style={{ ...num, fontWeight: 700 }}>{loadTotals.running}</td>
                <td style={{ ...num, fontWeight: 700 }}>{loadTotals.standby}</td>
                <td style={{ ...num, fontWeight: 700 }}>{loadTotals.hp}</td>
              </tr>
              <tr>
                <td style={docCell} colSpan={6}>
                  Factor of Safety {doc.loadFactorOfSafetyPct ?? 10}%
                </td>
                <td style={num}>{loadTotals.factorOfSafetyHp}</td>
              </tr>
              <tr>
                <td style={{ ...docCell, fontWeight: 700 }} colSpan={6}>
                  Total
                </td>
                <td style={{ ...num, fontWeight: 700 }}>{loadTotals.totalHp}</td>
              </tr>
            </tbody>
          </table>
          {/* Their document sets the conversion out on its own two lines, exactly so. */}
          <p style={docP}>
            Total electrical power capacity required to run the plant ≈ {loadTotals.requiredHp} HP.
          </p>
          <p style={{ ...docP, textAlign: "center" }}>
            1 HP = {HP_TO_KW} kW
            <br />
            {loadTotals.requiredHp} HP = {loadTotals.kw} kW ≈ {loadTotals.supplyKw} kW
          </p>
          <p style={{ ...docP, fontWeight: 700, textAlign: "center" }}>
            Electrical Power Supply Required for {p.plantType} Plant = {loadTotals.supplyKw} kW
          </p>
          <p style={docP}>
            We need incoming electrical cable to the {p.plantType} control panel to withstand the{" "}
            {loadTotals.supplyKw} kW power load.
          </p>
        </DocSection>
      )}

      {/* ---- 10. Financial proposal ---- */}
      <DocSection no={10} title="Financial Proposal" breakBefore>
        <div style={docH3}>10.1 Quotation:</div>
        <p style={docP}>
          The total project estimate envisages the price for the designing, detailed engineering,
          supply of all equipment, erection, commissioning, consumables for the stabilization test run
          and provision of operation and maintenance manuals.
        </p>
        <table style={{ ...avoidBreak, width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <thead>
            <tr>
              <th style={{ ...docHeadCell, width: 50, textAlign: "center" }}>S. No</th>
              <th style={docHeadCell}>Details</th>
              <th style={{ ...docHeadCell, textAlign: "right", width: 150 }}>Amount in Rs.</th>
            </tr>
          </thead>
          <tbody>
            {boq.map((b, i) => (
              <tr key={b.id}>
                <td style={{ ...docCell, textAlign: "center" }}>{i + 1}.</td>
                <td style={docCell}>{b.item}</td>
                <td style={num}>{formatDocRs(b.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={2}>
                TOTAL
              </td>
              <td style={{ ...num, fontWeight: 700 }}>{formatDocRs(subtotal)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ ...docP, fontWeight: 600 }}>{amountInWords(subtotal)} + GST 18% extra as applicable.</p>

        <table style={{ ...avoidBreak, width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={docCell}>
                Estimation for design, supply, erection and commissioning of the{" "}
                {capacity.designCapacityKLD || kld} KLD {plantName} using {p.technology} technology with the
                listed electro-mechanical and plumbing items
              </td>
              <td style={{ ...num, width: 150 }}>{formatDocRs(subtotal)}</td>
            </tr>
            <tr>
              <td style={docCell}>GST 18%</td>
              <td style={num}>{formatDocRs(gstAmount)}</td>
            </tr>
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }}>Total Amount</td>
              <td style={{ ...num, fontWeight: 700 }}>{formatDocRs(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ ...docP, fontWeight: 600 }}>{amountInWords(grandTotal)} (including GST).</p>
        <p style={docP}>
          Note: any miscellaneous charges, municipal charges or PCB clearance charges need to be borne
          by the promoter. Packing and forwarding extra at actuals.
        </p>

        <div style={docH3}>10.2 Taxes & Duties:</div>
        <DocProse text={company.doc.taxesDuties} />

        {terms.length > 0 && (
          <>
            <div style={docH3}>10.3 Payment Terms:</div>
            <ul style={{ fontSize: 12.5, lineHeight: 1.6, paddingLeft: 18, listStyleType: "disc" }}>
              {terms.map((t, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <strong>{t.percent}%</strong> of the total contract value — {t.description}.
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Closes §10.3 in all four samples. Boilerplate, not per-deal. */}
        {/* Literal caps rather than `text-transform` — CSS casing is a rendering hint
            the Word export cannot carry, so it would print mixed-case there. */}
        <div style={{ ...docH3, fontSize: 12.5 }}>FORCE MAJEURE:</div>
        <DocProse text={DEFAULT_DOC_FORCE_MAJEURE} />
      </DocSection>

      {/* ---- 11–14 ---- */}
      <DocSection no={11} title="Supply, Erection, Commissioning and Takeover">
        <DocProse text={company.doc.supplyErection} />
      </DocSection>

      <DocSection no={12} title="Warranty Details">
        <DocProse text={company.doc.warranty} />
      </DocSection>

      <DocSection no={13} title="Scope of Work by Green Ecocare">
        <DocProse text={company.doc.scopeGreenEcocare} />
        {/* Project-specific scope from the AI generator — complements the company
            standard above rather than replacing it. */}
        {Object.keys(scope).length > 0 && (
          <div style={avoidBreak}>
            <div style={docH3}>13.1 Scope for this Project:</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {Object.entries(scope).map(([k, val]) => (
                  <tr key={k}>
                    <td style={{ ...docCell, width: "22%", fontWeight: 700, textTransform: "capitalize" }}>{k}</td>
                    <td style={docCell}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DocSection>

      <DocSection no={14} title="Scope of Work for the Client">
        <DocProse text={company.doc.scopeClient} />
        {pointsToNote && (
          <>
            <div style={docH3}>Points to be Noted</div>
            <DocProse text={pointsToNote} />
          </>
        )}
      </DocSection>

      {/* ---- 15. Recent projects ---- */}
      {company.doc.recentProjects.length > 0 && (
        <DocSection no={15} title="Our Recent Completed Plants in the Projects">
          <ol style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0, paddingLeft: 22, listStyleType: "lower-roman" }}>
            {company.doc.recentProjects.map((r, i) => (
              <li key={i} style={{ ...avoidBreak, marginBottom: 8 }}>
                <div>Client: {r.client}</div>
                <div>Project: {r.project}</div>
                <div>Plant: {r.plant}</div>
                <div>Technology: {r.technology}</div>
                <div>Capacity: {r.capacity}</div>
              </li>
            ))}
          </ol>
        </DocSection>
      )}

      {/* ---- T&Cs, only when the admin customised them (see shouldPrintStandardTerms) ---- */}
      {printTcs && (
        <DocSection title="Terms & Conditions" breakBefore>
          <DocProse text={tcs} />
        </DocSection>
      )}

      <DocSignature
        company={company}
        signatoryName={company.doc.signatoryName}
        signatoryTitle={company.doc.signatoryTitle}
        signatoryPhone={company.doc.signatoryPhone}
        faithfully
      />
    </>
  );
}

const num = { ...docCell, textAlign: "right" as const };

function CalcRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td style={{ ...docCell, fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td style={{ ...num, fontWeight: bold ? 700 : 400 }}>{value}</td>
    </tr>
  );
}

/** "STP" → "Sewage Treatment Plant" etc, for the document's prose headings. */
function plantLabel(plantType: string): string {
  const map: Record<string, string> = {
    STP: "Sewage Treatment Plant",
    ETP: "Effluent Treatment Plant",
    WTP: "Water Treatment Plant",
  };
  return map[plantType] ?? plantType;
}

/** "Green Ecocare Private Limited" → "Green Ecocare". Their Greetings heading and
 *  their "For GREEN ECOCARE," sign-off both drop the legal suffix; the cover and the
 *  running letterhead keep it. */
function tradingName(name: string): string {
  return name
    .replace(/[,.]?\s*\b(private limited|pvt\.? ?ltd\.?|limited|ltd\.?|llp|inc\.?)\b\.?$/i, "")
    .trim();
}
