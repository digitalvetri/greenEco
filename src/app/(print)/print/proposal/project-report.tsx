import { formatINR, amountInWords } from "@/lib/money";
import { asProjectReportData, computeCapacity, computeLoadTotals } from "@/lib/domain/proposal-document";
import { TECHNOLOGY_COMPARISON } from "@/lib/project-report-templates";
import { shouldPrintStandardTerms, resolvePointsToNote } from "@/lib/project-report-boilerplate";
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
import { DocCover, DocSignature } from "@/components/print/doc-cover";
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

  const sections = [
    "Cover Letter",
    "Greetings",
    "Table of Contents",
    "Introduction",
    `${plantName} — Plant Details`,
    "Process Design of the Plant",
    "Civil Design",
    "MEP Design",
    "Electrical Load Calculation",
    "Financial Proposal",
    "Supply, Erection, Commissioning & Takeover",
    "Warranty Details",
    "Scope of Work by Green Ecocare",
    "Scope of Work for the Client",
    "Our Recent Completed Projects",
  ];

  return (
    <>
      <DocCover
        refNo={p.number}
        date={p.createdAt}
        title={`Proposal for the ${plantName} (Capacity ${lpd ? lpd.toLocaleString("en-IN") : "—"} litres per day) for ${p.projectName} at ${p.siteAddress}.`}
        company={company}
        customerName={p.customerName}
        customerAddress={p.siteAddress}
        kindAttn={p.kindAttn}
      />

      {/* ---- Greetings / cover letter ---- */}
      {v?.coverLetter && (
        <section style={{ ...pageBreak, pageBreakAfter: "always" }}>
          <h2 style={{ color: BRAND, fontSize: 16, marginBottom: 12 }}>Greetings from {company.name}</h2>
          <DocProse text={v.coverLetter} />
          <DocSignature
            company={company}
            signatoryName={company.doc.signatoryName}
            signatoryTitle={company.doc.signatoryTitle}
            signatoryPhone={company.doc.signatoryPhone}
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
                <td style={{ ...docCell, width: 44, textAlign: "center" }}>{i + 1}</td>
                <td style={docCell}>{s}</td>
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
        <DocProse text={company.doc.plantAbout} />
      </DocSection>

      {/* ---- 6. Process design ---- */}
      <DocSection no={6} title="Process Design of the Plant">
        {(doc.capacityCalc?.people || capacity.designCapacityLPD > 0) && (
          <div style={avoidBreak}>
            <div style={docH3}>6.1 Plant Capacity Calculation</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <tbody>
                {doc.capacityCalc?.people ? (
                  <CalcRow label="Total number of people" value={`${doc.capacityCalc.people.toLocaleString("en-IN")} people per day`} />
                ) : null}
                {doc.capacityCalc?.usagePerHead ? (
                  <CalcRow label="Water usage per head" value={`${doc.capacityCalc.usagePerHead} litres per day`} />
                ) : null}
                <CalcRow label="Sewage generated per day" value={`${capacity.sewagePerDay.toLocaleString("en-IN")} litres per day`} />
                {doc.capacityCalc?.factorOfSafety ? (
                  <CalcRow label="Factor of safety" value={`${doc.capacityCalc.factorOfSafety.toLocaleString("en-IN")} litres`} />
                ) : null}
                <CalcRow label="Total design capacity" value={`${capacity.designCapacityLPD.toLocaleString("en-IN")} litres per day`} bold />
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
            <ParameterTable heading="6.2 The Expected Inlet Parameters" rows={doc.inletParameters ?? []} />
            <ParameterTable heading="6.3 The Anticipated Final Water Quality" rows={doc.outletParameters ?? []} />
          </div>
        )}

        <div style={docH3}>6.4 Choosing the Process by Given Data</div>
        <p style={docP}>
          {plantName}s treat domestic and industrial sewage to make the water reusable or safe for
          discharge. Choosing the right technology ensures efficient treatment, compliance with
          environmental norms, and reduced operational costs. The most common technologies are:
        </p>
        <ol style={{ fontSize: 12.5, lineHeight: 1.6, paddingLeft: 20, marginBottom: 8 }}>
          {TECHNOLOGY_COMPARISON.map((t) => (
            <li key={t.key} style={{ marginBottom: 5 }}>
              <strong>{t.name}:</strong> {t.body}
            </li>
          ))}
        </ol>
        {doc.recommendation && <p style={docP}>{doc.recommendation}</p>}

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
            <div style={docH3}>6.6 Details of Process</div>
            {(doc.processUnits ?? []).map((u, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{u.unit}:</div>
                <DocProse text={u.body} />
              </div>
            ))}
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
            <div style={docH3}>8.1 Machinery and Equipment used for the Plant</div>
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

        {(doc.materialSpecs?.length ?? 0) > 0 && (
          <div>
            <div style={docH3}>8.2 Specifications of the Equipment</div>
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
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.title}</div>
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
          <p style={docP}>
            Total electrical power capacity required to run the plant ≈ {loadTotals.requiredHp} HP.
            {"\n"}1 HP = 0.7457 kW, so {loadTotals.requiredHp} HP = {loadTotals.kw} kW ≈{" "}
            {loadTotals.supplyKw} kW.
          </p>
          <p style={{ ...docP, fontWeight: 700 }}>
            Electrical power supply required for the plant = {loadTotals.supplyKw} kW.
          </p>
          <p style={docP}>
            We need an incoming electrical cable to the control panel able to withstand the{" "}
            {loadTotals.supplyKw} kW power load.
          </p>
        </DocSection>
      )}

      {/* ---- 10. Financial proposal ---- */}
      <DocSection no={10} title="Financial Proposal" breakBefore>
        <div style={docH3}>10.1 Quotation</div>
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
                <td style={{ ...docCell, textAlign: "center" }}>{i + 1}</td>
                <td style={docCell}>{b.item}</td>
                <td style={num}>{formatINR(b.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }} colSpan={2}>
                TOTAL
              </td>
              <td style={{ ...num, fontWeight: 700 }}>{formatINR(subtotal)}</td>
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
              <td style={{ ...num, width: 150 }}>{formatINR(subtotal)}</td>
            </tr>
            <tr>
              <td style={docCell}>GST 18%</td>
              <td style={num}>{formatINR(gstAmount)}</td>
            </tr>
            <tr>
              <td style={{ ...docCell, fontWeight: 700 }}>Total Amount</td>
              <td style={{ ...num, fontWeight: 700 }}>{formatINR(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ ...docP, fontWeight: 600 }}>{amountInWords(grandTotal)} (including GST).</p>
        <p style={docP}>
          Note: any miscellaneous charges, municipal charges or PCB clearance charges need to be borne
          by the promoter. Packing and forwarding extra at actuals.
        </p>

        <div style={docH3}>10.2 Taxes & Duties</div>
        <DocProse text={company.doc.taxesDuties} />

        {terms.length > 0 && (
          <>
            <div style={docH3}>10.3 Payment Terms</div>
            <ul style={{ fontSize: 12.5, lineHeight: 1.6, paddingLeft: 18 }}>
              {terms.map((t, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <strong>{t.percent}%</strong> of the total contract value — {t.description}.
                </li>
              ))}
            </ul>
          </>
        )}
      </DocSection>

      {/* ---- 11–14 ---- */}
      <DocSection no={11} title="Supply, Erection, Commissioning and Takeover">
        <DocProse text={company.doc.supplyErection} />
      </DocSection>

      <DocSection no={12} title="Warranty Details">
        <DocProse text={company.doc.warranty} />
      </DocSection>

      <DocSection no={13} title={`Scope of Work by ${company.name}`}>
        <DocProse text={company.doc.scopeGreenEcocare} />
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
        <DocSection no={15} title="Our Recent Completed Projects">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={docHeadCell}>Client</th>
                <th style={docHeadCell}>Project</th>
                <th style={docHeadCell}>Plant</th>
                <th style={docHeadCell}>Technology</th>
                <th style={{ ...docHeadCell, textAlign: "right" }}>Capacity</th>
              </tr>
            </thead>
            <tbody>
              {company.doc.recentProjects.map((r, i) => (
                <tr key={i}>
                  <td style={docCell}>{r.client}</td>
                  <td style={docCell}>{r.project}</td>
                  <td style={docCell}>{r.plant}</td>
                  <td style={docCell}>{r.technology}</td>
                  <td style={num}>{r.capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
