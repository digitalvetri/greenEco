import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DEFAULT_STANDARD_TERMS } from "@/lib/constants";
import * as B from "@/lib/project-report-boilerplate";

/** The company-level half of the Project Report document (see project-report-boilerplate.ts). */
export interface ProjectReportBoilerplate {
  introduction: string;
  plantAbout: string;
  /** Raw column value — null means "no company override", so the document can fall
   *  back to the copy for ITS plant type rather than the STP default. */
  plantAboutOverride: string | null;
  civilDesign: string;
  mepDesign: string;
  taxesDuties: string;
  supplyErection: string;
  warranty: string;
  scopeGreenEcocare: string;
  scopeClient: string;
  pointsToNote: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryPhone: string;
  recentProjects: B.RecentProject[];
}

/**
 * Company-level settings that are editable from the Settings screen and consumed at
 * runtime (so a change takes effect on the next automation run — no redeploy). Values
 * live on the Company row; anything unset falls back to the env default, preserving
 * the pre-edit behaviour. All money/threshold fields normalised to plain numbers.
 */
export interface CompanySettings {
  // Identity / details
  name: string;
  gstin: string;
  stateCode: string;
  address: string;
  logoUrl: string;
  invoicePrefix: string;
  orderPrefix: string;
  proposalPrefix: string;
  poPrefix: string;
  // Letterhead (every print/* PDF header/footer)
  tagline: string;
  phone: string;
  email: string;
  website: string;
  branches: string[];
  standardTermsTemplate: string;
  /** Project Report boilerplate — the sections of the client's real document that are
   *  identical across every technology, editable in Settings → Proposal document. */
  doc: ProjectReportBoilerplate;
  // Thresholds
  minMarginPct: number; // 0..1
  autoApproveLimit: number; // ₹; 0 = all manual
  budgetAlertPct: number[]; // e.g. [70, 90, 100]
  lowStockMultiplier: number; // reorder-level buffer (1 = at level)
}

const DEFAULT_BUDGET_ALERTS = [70, 90, 100];

/**
 * Resolve effective settings for a company (by id, so automations without a full ctx
 * can call it too). Merges the stored Company row over env defaults.
 */
export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  return {
    name: c?.name ?? "Green Ecocare Pvt Ltd",
    gstin: c?.gstin ?? env.companyGstin,
    stateCode: c?.stateCode ?? env.companyStateCode,
    address: c?.address ?? "",
    logoUrl: c?.logoUrl ?? "",
    invoicePrefix: c?.invoicePrefix || env.invoicePrefix,
    orderPrefix: c?.orderPrefix || env.orderPrefix,
    proposalPrefix: c?.proposalPrefix || env.proposalPrefix,
    poPrefix: c?.poPrefix || env.poPrefix,
    tagline: c?.tagline ?? "It's our future",
    phone: c?.phone ?? "6304984052, 8122773433",
    email: c?.email ?? "mailgreenecocare@gmail.com",
    website: c?.website ?? "www.greenecocare.com",
    branches: c?.branches?.length ? c.branches : ["Bangalore", "Hyderabad", "Cochin", "Mangalore", "Chennai"],
    standardTermsTemplate: c?.standardTermsTemplate ?? DEFAULT_STANDARD_TERMS,
    doc: {
      introduction: c?.docIntroduction ?? B.DEFAULT_DOC_INTRODUCTION,
      plantAbout: c?.docPlantAbout ?? B.DEFAULT_DOC_PLANT_ABOUT,
      plantAboutOverride: c?.docPlantAbout ?? null,
      civilDesign: c?.docCivilDesign ?? B.DEFAULT_DOC_CIVIL_DESIGN,
      mepDesign: c?.docMepDesign ?? B.DEFAULT_DOC_MEP_DESIGN,
      taxesDuties: c?.docTaxesDuties ?? B.DEFAULT_DOC_TAXES_DUTIES,
      supplyErection: c?.docSupplyErection ?? B.DEFAULT_DOC_SUPPLY_ERECTION,
      warranty: c?.docWarranty ?? B.DEFAULT_DOC_WARRANTY,
      scopeGreenEcocare: c?.docScopeGreenEcocare ?? B.DEFAULT_DOC_SCOPE_GREENECOCARE,
      scopeClient: c?.docScopeClient ?? B.DEFAULT_DOC_SCOPE_CLIENT,
      pointsToNote: c?.docPointsToNote ?? B.DEFAULT_DOC_POINTS_TO_NOTE,
      signatoryName: c?.docSignatoryName ?? B.DEFAULT_DOC_SIGNATORY_NAME,
      signatoryTitle: c?.docSignatoryTitle ?? B.DEFAULT_DOC_SIGNATORY_TITLE,
      signatoryPhone: c?.docSignatoryPhone ?? B.DEFAULT_DOC_SIGNATORY_PHONE,
      recentProjects: (c?.docRecentProjects as B.RecentProject[] | null) ?? B.DEFAULT_DOC_RECENT_PROJECTS,
    },
    minMarginPct: c?.minMarginPct != null ? Number(c.minMarginPct) : env.minMarginPct,
    autoApproveLimit: c?.autoApproveLimit != null ? c.autoApproveLimit : env.autoApproveLimit,
    budgetAlertPct: c?.budgetAlertPct?.length ? c.budgetAlertPct : DEFAULT_BUDGET_ALERTS,
    lowStockMultiplier: c?.lowStockMultiplier != null ? Number(c.lowStockMultiplier) : 1,
  };
}

/** Ctx-scoped accessor for the current tenant (Settings page + services). */
export function getSettingsFor(ctx: Ctx): Promise<CompanySettings> {
  return getCompanySettings(ctx.companyId);
}

export interface CompanyDetailsInput {
  name: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  logoUrl?: string;
  invoicePrefix?: string;
  orderPrefix?: string;
  proposalPrefix?: string;
  poPrefix?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  website?: string;
  branches?: string[];
  standardTermsTemplate?: string;
}

/** Update company identity/details. Admin only, audited. */
export async function updateCompanyDetails(ctx: Ctx, input: CompanyDetailsInput) {
  requireAdmin(ctx);
  const name = input.name?.trim();
  if (!name) throw new Error("Company name is required");

  const before = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  const updated = await prisma.company.update({
    where: { id: ctx.companyId },
    data: {
      name,
      gstin: input.gstin?.trim().toUpperCase() || null,
      stateCode: input.stateCode?.trim() || "33",
      address: input.address?.trim() || null,
      logoUrl: input.logoUrl?.trim() || null,
      invoicePrefix: input.invoicePrefix?.trim() || null,
      orderPrefix: input.orderPrefix?.trim() || null,
      proposalPrefix: input.proposalPrefix?.trim() || null,
      poPrefix: input.poPrefix?.trim() || null,
      tagline: input.tagline?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      branches: input.branches?.map((b) => b.trim()).filter(Boolean) ?? [],
      standardTermsTemplate: input.standardTermsTemplate?.trim() || null,
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Company",
    entityId: ctx.companyId,
    before: { name: before?.name, gstin: before?.gstin, address: before?.address },
    after: { name: updated.name, gstin: updated.gstin, address: updated.address },
  });
  return { ok: true };
}

export interface ThresholdsInput {
  minMarginPct: number; // 0..1
  autoApproveLimit: number; // ₹
  budgetAlertPct: number[]; // ascending percents
  lowStockMultiplier: number; // >= 0.1
}

/** Update runtime thresholds. Admin only, audited. Takes effect on the next run. */
export async function updateThresholds(ctx: Ctx, input: ThresholdsInput) {
  requireAdmin(ctx);
  const margin = Number(input.minMarginPct);
  if (!Number.isFinite(margin) || margin < 0 || margin > 1) {
    throw new Error("Min margin must be between 0 and 100%");
  }
  const limit = Math.max(0, Math.floor(Number(input.autoApproveLimit) || 0));
  const mult = Number(input.lowStockMultiplier);
  if (!Number.isFinite(mult) || mult < 0.1 || mult > 10) {
    throw new Error("Low-stock multiplier must be between 0.1 and 10");
  }
  const alerts = [...new Set((input.budgetAlertPct ?? []).map((n) => Math.round(Number(n))))]
    .filter((n) => n > 0 && n <= 200)
    .sort((a, b) => a - b);
  if (alerts.length === 0) throw new Error("At least one budget alert threshold is required");

  const before = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  await prisma.company.update({
    where: { id: ctx.companyId },
    data: {
      minMarginPct: margin.toFixed(4),
      autoApproveLimit: limit,
      budgetAlertPct: alerts,
      lowStockMultiplier: mult.toFixed(2),
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Company",
    entityId: ctx.companyId,
    before: {
      minMarginPct: before?.minMarginPct?.toString() ?? null,
      autoApproveLimit: before?.autoApproveLimit ?? null,
      budgetAlertPct: before?.budgetAlertPct ?? null,
      lowStockMultiplier: before?.lowStockMultiplier?.toString() ?? null,
    },
    after: { minMarginPct: margin, autoApproveLimit: limit, budgetAlertPct: alerts, lowStockMultiplier: mult },
  });
  return { ok: true };
}

/**
 * Project Report boilerplate editor (Settings → Proposal document). Deliberately its
 * OWN updater rather than 14 more optional fields on CompanyDetailsInput — same split
 * as updateThresholds, and it keeps the company-identity form from turning into a
 * wall of textareas. Admin only, audited by field NAME (the values are long document
 * copy, not worth duplicating into the audit log).
 *
 * A field cleared to empty is stored as null, which means "fall back to the shipped
 * default" — so the office can always get back to the original wording by blanking it.
 */
export interface ProposalDocumentInput {
  introduction?: string;
  plantAbout?: string;
  civilDesign?: string;
  mepDesign?: string;
  taxesDuties?: string;
  supplyErection?: string;
  warranty?: string;
  scopeGreenEcocare?: string;
  scopeClient?: string;
  pointsToNote?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  signatoryPhone?: string;
  recentProjects?: B.RecentProject[];
}

export async function updateProposalDocument(ctx: Ctx, input: ProposalDocumentInput) {
  requireAdmin(ctx);
  const t = (v: string | undefined) => (v?.trim() ? v.trim() : null);
  await prisma.company.update({
    where: { id: ctx.companyId },
    data: {
      docIntroduction: t(input.introduction),
      docPlantAbout: t(input.plantAbout),
      docCivilDesign: t(input.civilDesign),
      docMepDesign: t(input.mepDesign),
      docTaxesDuties: t(input.taxesDuties),
      docSupplyErection: t(input.supplyErection),
      docWarranty: t(input.warranty),
      docScopeGreenEcocare: t(input.scopeGreenEcocare),
      docScopeClient: t(input.scopeClient),
      docPointsToNote: t(input.pointsToNote),
      docSignatoryName: t(input.signatoryName),
      docSignatoryTitle: t(input.signatoryTitle),
      docSignatoryPhone: t(input.signatoryPhone),
      docRecentProjects: input.recentProjects
        ? (input.recentProjects.filter((p) => p.client?.trim() || p.project?.trim()) as object)
        : undefined,
    },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Company",
    entityId: ctx.companyId,
    after: { proposalDocumentFields: Object.keys(input) },
  });
  return { ok: true };
}
