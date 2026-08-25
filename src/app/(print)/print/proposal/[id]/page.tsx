import { notFound } from "next/navigation";
import { getPrintSession } from "@/lib/print-session";
import { getProposal } from "@/server/services/proposal";
import { getCompanySettings } from "@/server/services/company-settings";
import { PrintShell } from "@/components/print/print-shell";
import { PrintActionButton } from "@/components/print/print-button";
import { ProjectReportDocument } from "../project-report";
import { BoqProposalDocument } from "../boq-proposal";
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

  // The Project Report and BOQ carry their own cover page with the full letterhead,
  // so the generic branded header would duplicate it — those render bare.
  const structured = p.proposalType === "Project Proposal" || p.proposalType === "BOQ Proposal";
  if (structured) {
    return (
      <div data-print-shell>
        <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm 14mm; } }`}</style>
        <div className="no-print" style={{ marginBottom: 16, textAlign: "right" }}>
          <PrintActionButton />
        </div>
        {p.proposalType === "Project Proposal" ? (
          <ProjectReportDocument {...data} />
        ) : (
          <BoqProposalDocument {...data} />
        )}
      </div>
    );
  }

  return (
    <PrintShell title="PROPOSAL" docNo={`${p.number} · v${current?.versionNo ?? 1}`} company={company} watermark>
      <GenericProposalDocument {...data} />
    </PrintShell>
  );
}
