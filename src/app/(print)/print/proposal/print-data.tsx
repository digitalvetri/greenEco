import type { CompanySettings } from "@/server/services/company-settings";

/**
 * The shape every proposal print template receives.
 *
 * Assembled once in page.tsx from `getProposal` (which applies the tenant check, the
 * office-only visibility gate and EMPLOYEE field-stripping) so the templates are pure
 * presentation and can't accidentally widen access.
 *
 * Decimals are already strings/numbers here — templates never touch Prisma types.
 */
export interface ProposalPrintData {
  p: {
    number: string;
    createdAt: Date;
    projectName: string;
    siteAddress: string;
    plantType: string;
    technology: string;
    capacityKLD: number;
    proposalType: string | null;
    customerName: string;
    kindAttn: string | null;
  };
  v: {
    versionNo: number;
    coverLetter: string | null;
    technicalText: string | null;
    technologyExplainer: string | null;
    pointsToNote: string | null;
    terms: unknown;
    scopeOfWork: unknown;
    technicalSpecs: unknown;
    electricalLoad: unknown;
    documentData: unknown;
    heroImageUrl: string | null;
    subtotal: string;
    gstAmount: string;
    grandTotal: string;
    paymentTerms: unknown;
    validityDays: number;
    boqItems: {
      id: string;
      category: string;
      item: string;
      specification: string | null;
      unit: string;
      qty: string;
      rate: string;
      amount: string;
    }[];
  } | null;
  company: CompanySettings;
}
