import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getProposal } from "@/server/services/proposal";
import { getCompanySettings } from "@/server/services/company-settings";
import { PrintShell } from "@/components/print/print-shell";
import { PrintActionButton } from "@/components/print/print-button";
import { ProjectReportDocument } from "../project-report";
import { BoqProposalDocument } from "../boq-proposal";
import { AmcProposalDocument } from "../amc-proposal";
import { ServiceProformaDocument } from "../service-proforma";
import { GenericProposalDocument } from "../generic-proposal";
import type { ProposalPrintData } from "../print-data";

export const dynamic = "force-dynamic";

/**
 * Proposal PDF — dispatches on `proposalType` to the document format the client
 * actually uses for that kind of quote.
 *
 * Auth, the office-only visibility gate and EMPLOYEE field-stripping all happen once
 * here via `getProposal`; the templates below are pure presentation and receive an
 * already-safe `ProposalPrintData`.
 *
 * Unknown/absent type falls through to the pre-Phase-C generic layout, so every
 * proposal created before this work still prints — and Service/AMC print plainly
 * rather than in a format invented for them.
 */
export default async function ProposalPrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const session = await getPrintSession(t, "proposal", id);
  const p = await getProposal(session, id);
  if (!p) notFound();
  const company = await getCompanySettings(session.companyId);
  const current = p.versions.find((x) => x.versionNo === p.currentVersion) ?? p.versions[0];

  const data: ProposalPrintData = {
    p: {
      number: p.number,
      createdAt: p.createdAt,
      projectName: p.projectName,
      siteAddress: p.siteAddress,
      plantType: p.plantType,
      technology: p.technology,
      capacityKLD: p.capacityKLD,
      proposalType: p.proposalType,
      customerName: p.lead?.customerName ?? p.projectName,
      kindAttn: p.contactPerson
        ? `${p.contactPerson.name}${p.contactPerson.designation ? ` (${p.contactPerson.designation})` : ""}`
        : null,
    },
    v: current
      ? {
          versionNo: current.versionNo,
          coverLetter: current.coverLetter,
          technicalText: current.technicalText,
          technologyExplainer: current.technologyExplainer,
          pointsToNote: current.pointsToNote,
          terms: current.terms,
          scopeOfWork: current.scopeOfWork,
          technicalSpecs: current.technicalSpecs,
          electricalLoad: current.electricalLoad,
          documentData: current.documentData,
          heroImageUrl: current.heroImageUrl,
          subtotal: current.subtotal.toString(),
          gstAmount: current.gstAmount.toString(),
          grandTotal: current.grandTotal.toString(),
          paymentTerms: current.paymentTerms,
          validityDays: current.validityDays,
          boqItems: current.boqItems.map((b) => ({
            id: b.id,
            category: b.category,
            item: b.item,
            specification: b.specification,
            unit: b.unit,
            qty: b.qty.toString(),
            rate: b.rate.toString(),
            amount: b.amount.toString(),
          })),
        }
      : null,
    company,
  };

  // Every format the client has supplied a sample for carries its OWN letterhead —
  // a cover page (Project Report / BOQ / AMC) or its own header block (the Service
  // proforma) — so the generic branded shell would duplicate it. Those render bare.
  // Anything else (Others, or a proposal predating types) keeps the generic layout.
  const Structured = {
    "Project Proposal": ProjectReportDocument,
    "BOQ Proposal": BoqProposalDocument,
    "AMC Proposal": AmcProposalDocument,
    "Service Proposal": ServiceProformaDocument,
  }[p.proposalType ?? ""];

  if (Structured) {
    return (
      <div data-print-shell>
        <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm 14mm; } }`}</style>
        <div className="no-print" style={{ marginBottom: 16, textAlign: "right" }}>
          <PrintActionButton />
        </div>
        <Structured {...data} />
      </div>
    );
  }

  return (
    <PrintShell title="PROPOSAL" docNo={`${p.number} · v${current?.versionNo ?? 1}`} company={company} watermark>
      <GenericProposalDocument {...data} />
    </PrintShell>
  );
}
