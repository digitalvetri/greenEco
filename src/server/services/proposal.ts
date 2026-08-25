import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getCompanySettings } from "./company-settings";
import { allocateNumber } from "./numbering";
import { recordProposalOutcome } from "@/server/automations/winloss-learning";
import { generateProposalDraft, type AiProposalInput, type AiProposalDraft } from "@/lib/ai";
import { streamProposalDraft } from "@/lib/ai-stream";
import { DEFAULT_STAGES, deriveCapacityKLD } from "@/lib/constants";
import { proposalExpiry } from "@/lib/domain/proposal-aging";
import { parseDocumentData } from "@/lib/domain/proposal-document";
import { visibleProposalWhere, canSeeProposal } from "./proposal-visibility";
import { formatINR } from "@/lib/money";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { llmText } from "@/lib/llm";
import { loadConfig } from "@/lib/runtime-config";
import { geminiGenerateImage } from "@/lib/gemini";
import { putObject } from "@/lib/storage";
import { randomUUID } from "crypto";

const GST_RATE = 18;

export async function getProposal(ctx: Ctx, id: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      lead: {
        select: {
          id: true,
          phone: true,
          customerName: true,
          contacts: { select: { id: true, name: true, designation: true } },
        },
      },
      contactPerson: { select: { id: true, name: true, designation: true } },
      order: { select: { id: true, orderNo: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        // Ordered by id, NOT category. saveVersion deletes and recreates every BOQ row
        // in the order the editor sent them, and Prisma's cuid() sorts lexicographically
        // by creation time — so id-asc IS the order the admin typed. Sorting by category
        // scrambled that: a BOQ Proposal's line sequence is the estimate's own running
        // order and its printed S.No has to match what was entered.
        include: { boqItems: { orderBy: { id: "asc" } } },
      },
      followUps: { orderBy: { datetime: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!proposal) return null;
  // An unconfirmed (DRAFT) proposal is office-only. Collapsed to the same `null` a
  // missing/cross-tenant id returns, so a direct-link probe can't tell "being drafted"
  // from "doesn't exist". This also gates /print/proposal/[id] and /api/pdf, which
  // both resolve the document through here.
  if (!canSeeProposal(ctx, proposal)) return null;
  return stripPricing(proposal, ctx.role);
}

/** Attach an already-uploaded document (url/name from /api/uploads) to a proposal. */
export async function addProposalDocument(ctx: Ctx, proposalId: string, doc: { url: string; name: string }) {
  const p = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  // The WRITE paths need the same office-only gate as the reads: an employee who
  // learned a draft's id (it is serialized into their own request row) must not be
  // able to write to a proposal they cannot open. Same collapsed error as not-found.
  if (!p || !canSeeProposal(ctx, p)) throw new Error("Proposal not found");
  const created = await prisma.proposalDocument.create({
    data: { companyId: ctx.companyId, proposalId, url: doc.url, name: doc.name, createdById: ctx.userId },
  });
  await logAudit(ctx, { action: "CREATE", entity: "ProposalDocument", entityId: created.id, after: { proposalId, name: doc.name } });
  return created;
}

export interface AddProposalFollowUpInput {
  type: "CALL" | "SITE_VISIT" | "WHATSAPP" | "EMAIL" | "MEETING";
  notes: string;
  rawTranscript?: string;
  outcome?: "INTERESTED" | "NEEDS_TIME" | "PRICE_DISCUSSION" | "NOT_REACHABLE" | "NEGATIVE";
  nextDate?: Date;
  lat?: number;
  lng?: number;
  geoAddress?: string;
}

/**
 * Log a follow-up against a proposal — the same FollowUp engine leads use (schema
 * comment: "same engine reused post-quote"), but the write path only ever existed
 * for leads; getProposal/proposalActivity already read proposal follow-ups, there
 * was just no way to create one. Deliberately does NOT touch ProposalStatus (no
 * lead-style closeStatus/lostReason coupling) — status transitions have their own
 * dedicated controls (Mark under negotiation / Reopen / Mark lost).
 */
export async function addProposalFollowUp(ctx: Ctx, proposalId: string, input: AddProposalFollowUpInput) {
  const p = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  if (!p || !canSeeProposal(ctx, p)) throw new Error("Proposal not found");
  const fu = await prisma.followUp.create({
    data: {
      proposalId,
      type: input.type,
      notes: input.notes,
      rawTranscript: input.rawTranscript,
      outcome: input.outcome,
      nextDate: input.nextDate,
      lat: input.lat,
      lng: input.lng,
      geoAddress: input.geoAddress,
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "FollowUp", entityId: fu.id, after: { proposalId } });
  return fu;
}

export async function deleteProposalDocument(ctx: Ctx, docId: string) {
  const doc = await prisma.proposalDocument.findFirst({
    where: { id: docId, companyId: ctx.companyId },
    include: { proposal: { select: { status: true } } },
  });
  // Gate on the PARENT proposal — a document hanging off an unconfirmed draft is
  // just as office-only as the draft itself.
  if (!doc || !canSeeProposal(ctx, doc.proposal)) throw new Error("Document not found");
  await prisma.proposalDocument.delete({ where: { id: docId } });
  await logAudit(ctx, { action: "DELETE", entity: "ProposalDocument", entityId: docId, before: { name: doc.name } });
  return { ok: true };
}

/**
 * Send the proposal to the client via WhatsApp/email and log it (spec §7.2 —
 * "Approve & Send" only flipped a status before; nothing was actually sent).
 * Admin only. Send is gated (no provider → LOGGED); the log always records the
 * touch, merged into the proposal timeline. Uses the durable stored PDF link if
 * one has been generated. ⚠️ Live delivery needs keys (untested here).
 */
export async function sendProposalToClient(
  ctx: Ctx,
  proposalId: string,
  channel: "WHATSAPP" | "EMAIL",
) {
  requireAdmin(ctx);
  const p = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: {
      lead: { select: { phone: true, email: true, customerName: true } },
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { pdfUrl: true } },
    },
  });
  if (!p) throw new Error("Proposal not found");

  const pdf = p.versions[0]?.pdfUrl;
  const link = pdf ? `${env.appUrl.replace(/\/$/, "")}${pdf}` : "";
  const body = `Dear ${p.lead.customerName}, your proposal ${p.number} for "${p.projectName}" is ready.${link ? ` View: ${link}` : ""} — Green Ecocare`;

  let to: string | null;
  let res: { sent: boolean };
  if (channel === "WHATSAPP") {
    to = p.lead.phone;
    if (!to) throw new Error("This proposal's lead has no phone number");
    const r = await sendWhatsAppText(to, body);
    res = { sent: r.sent };
  } else {
    to = p.lead.email;
    if (!to) throw new Error("This proposal's lead has no email address");
    const r = await sendEmail({ to, subject: `Proposal ${p.number} — Green Ecocare`, html: `<p>${body}</p>` });
    res = { sent: r.sent };
  }

  const comm = await prisma.communication.create({
    data: {
      companyId: ctx.companyId,
      proposalId,
      channel,
      direction: "OUT",
      body,
      toAddress: to,
      sentStatus: res.sent ? "SENT" : "LOGGED",
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Communication", entityId: comm.id, after: { proposalId, channel } });
  return { sent: res.sent, status: comm.sentStatus, to, body };
}

function currentVersionOf<T extends { versionNo: number }>(p: {
  currentVersion: number;
  versions: T[];
}): T | undefined {
  return p.versions.find((v) => v.versionNo === p.currentVersion) ?? p.versions[0];
}

export interface ProposalEvent {
  at: Date;
  kind: "created" | "version" | "ai" | "approved" | "status" | "followup" | "won" | "lost" | "comm";
  title: string;
  detail?: string;
  amount?: string; // version grand total (sell-side; visible to all)
  delta?: { dir: "up" | "down"; label: string }; // price change vs the previous version
  followUp?: { type: string; outcome: string | null; notes: string; nextDate: Date | null };
  comm?: { channel: string; direction: string; body: string; sentStatus: string | null };
}

/**
 * Merged proposal activity (spec §7.2) — the richest native timeline in the app.
 * Combines: created → each version save (v{n} + changeNote + **grand-total delta**,
 * i.e. the negotiation price history) → AI-generation → approve & send → the
 * proposal's follow-ups (loaded by getProposal but never shown until now) →
 * status changes (audit) → Won (order)/Lost. Newest-first. Amounts are sell-side.
 */
export async function proposalActivity(ctx: Ctx, id: string): Promise<ProposalEvent[] | null> {
  const p = await prisma.proposal.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      versions: {
        orderBy: { versionNo: "asc" },
        select: { versionNo: true, changeNote: true, grandTotal: true, aiGenerated: true, approvedById: true, createdAt: true },
      },
      followUps: { orderBy: { datetime: "desc" } },
      communications: { orderBy: { createdAt: "desc" } },
      order: { select: { orderNo: true, createdAt: true } },
    },
  });
  if (!p) return null;
  // Same office-only gate as getProposal — the activity feed carries the version
  // price trail, so it must not become a side channel onto an unconfirmed draft.
  if (!canSeeProposal(ctx, p)) return null;

  const users = await prisma.user.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const events: ProposalEvent[] = [];
  events.push({ at: p.createdAt, kind: "created", title: "Proposal created", detail: p.projectName });

  let prevTotal: number | null = null;
  for (const v of p.versions) {
    const total = Number(v.grandTotal);
    const delta =
      prevTotal !== null && total !== prevTotal
        ? {
            dir: (total > prevTotal ? "up" : "down") as "up" | "down",
            label: formatINR(Math.abs(total - prevTotal)),
          }
        : undefined;
    events.push({
      at: v.createdAt,
      kind: v.aiGenerated && v.versionNo === 1 ? "ai" : "version",
      title: `v${v.versionNo}`,
      detail: v.changeNote ?? (v.versionNo === 1 ? (v.aiGenerated ? "AI-generated draft" : "initial draft") : "revised"),
      amount: total > 0 ? formatINR(total) : undefined,
      delta,
    });
    if (v.approvedById) {
      events.push({
        at: v.createdAt,
        kind: "approved",
        title: "Approved & sent",
        detail: nameOf.get(v.approvedById) ? `by ${nameOf.get(v.approvedById)}` : undefined,
      });
    }
    prevTotal = total;
  }

  for (const f of p.followUps) {
    events.push({
      at: f.datetime,
      kind: "followup",
      title: f.type.replace(/_/g, " "),
      followUp: { type: f.type, outcome: f.outcome, notes: f.notes, nextDate: f.nextDate },
    });
  }

  for (const c of p.communications) {
    events.push({
      at: c.createdAt,
      kind: "comm",
      title: `${c.channel} →`,
      comm: { channel: c.channel, direction: c.direction, body: c.body, sentStatus: c.sentStatus },
    });
  }

  // Status changes from the audit trail (negotiation / lost / reopen).
  const audits = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, entity: "Proposal", entityId: id, action: "UPDATE" },
    orderBy: { createdAt: "desc" },
  });
  for (const a of audits) {
    const after = (a.after ?? {}) as Record<string, unknown>;
    if ("status" in after) {
      const s = String(after.status);
      events.push({ at: a.createdAt, kind: s === "LOST" ? "lost" : "status", title: `Status → ${s.replace(/_/g, " ")}` });
    }
  }

  if (p.order) {
    events.push({ at: p.order.createdAt, kind: "won", title: "Won → order created", detail: p.order.orderNo });
  }

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return events;
}

export async function updateBasics(
  ctx: Ctx,
  id: string,
  data: {
    projectName?: string;
    siteAddress?: string;
    plantType?: string;
    technology?: string;
    capacityKLD?: number;
    capacityValue?: number;
    capacityUnit?: string;
    contactPersonId?: string | null;
    proposalType?: string | null;
    projectCategory?: string | null;
  },
) {
  const proposal = await prisma.proposal.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "WON" || proposal.status === "LOST") {
    throw new Error("Proposal is locked");
  }
  // "Kind Attn" must be one of THIS proposal's own lead's contacts — ContactPerson
  // has no companyId, so tenant-safety comes from checking it belongs to the lead.
  if (data.contactPersonId) {
    const contact = await prisma.contactPerson.findFirst({
      where: { id: data.contactPersonId, leadId: proposal.leadId },
      select: { id: true },
    });
    if (!contact) throw new Error("Contact person not found on this lead");
  }
  // capacityKLD is the canonical KLD number every downstream consumer reads —
  // derived from capacityValue/capacityUnit here rather than trusting the
  // client's math, same as the lead-side resolveCapacityKLD.
  const resolved = {
    ...data,
    capacityKLD: data.capacityUnit
      ? deriveCapacityKLD(data.capacityValue ?? data.capacityKLD ?? 0, data.capacityUnit)
      : data.capacityKLD,
  };
  await prisma.proposal.update({ where: { id }, data: resolved });
  await logAudit(ctx, { action: "UPDATE", entity: "Proposal", entityId: id, after: resolved });
  return { ok: true };
}

interface VersionSaveInput {
  technicalText?: string;
  /** Per-type document fields — validated against the proposal's own type. */
  documentData?: unknown;
  coverLetter?: string;
  pointsToNote?: string;
  technologyExplainer?: string;
  technicalSpecs?: Prisma.InputJsonValue;
  electricalLoad?: Prisma.InputJsonValue;
  scopeOfWork?: Prisma.InputJsonValue;
  terms?: Prisma.InputJsonValue;
  paymentTerms?: Prisma.InputJsonValue;
  validityDays?: number;
  estimatedCost?: number | null; // ADMIN only
  changeNote?: string;
  boqItems?: Array<{
    category: string;
    item: string;
    specification?: string;
    unit: string;
    qty: number;
    rate: number;
    amount?: number;
    aiSuggested?: boolean;
  }>;
}

function computeTotals(
  boq: Array<{ qty: number; rate: number; amount?: number }>,
): { subtotal: Decimal; gst: Decimal; grand: Decimal } {
  const subtotal = boq.reduce<Decimal>(
    (a, l) => a.plus(new Decimal(l.amount ?? new Decimal(l.qty).times(l.rate).toNumber())),
    new Decimal(0),
  );
  const gst = subtotal.times(GST_RATE).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { subtotal: subtotal.toDecimalPlaces(2), gst, grand: subtotal.plus(gst).toDecimalPlaces(2) };
}

/**
 * Save the proposal's working version. If status >= SENT, a new versionNo is
 * created (with changeNote) so old PDFs remain valid (spec §7.2). EMPLOYEE may
 * only save while DRAFT and cannot set estimatedCost (margin guard is admin data).
 */
export async function saveVersion(ctx: Ctx, proposalId: string, input: VersionSaveInput) {
  // Validate BOQ lines before hitting the DB — Number("") === 0, Number("abc") === NaN,
  // and new Decimal(NaN) constructs silently, corrupting totals.
  if (input.boqItems) {
    for (const line of input.boqItems) {
      if (!Number.isFinite(line.qty) || line.qty < 0)
        throw new Error("BOQ line has an invalid quantity — must be a non-negative number");
      if (!Number.isFinite(line.rate) || line.rate < 0)
        throw new Error("BOQ line has an invalid rate — must be a non-negative number");
    }
  }

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: { versions: { include: { boqItems: true } } },
  });
  // Gate BEFORE the status checks below. The old rule ("an employee may edit while
  // DRAFT") is now exactly inverted: DRAFT is the one state an employee must not
  // touch, because the office writes proposals and an unconfirmed one isn't theirs
  // to see, let alone edit. Collapsed to not-found so a draft id learned elsewhere
  // (it is serialized into the requester's own request row) reveals nothing.
  if (!proposal || !canSeeProposal(ctx, proposal)) throw new Error("Proposal not found");
  if (proposal.status === "WON" || proposal.status === "LOST") throw new Error("Proposal is locked");
  if (ctx.role !== "ADMIN") {
    throw new Error("Only admins can edit a proposal");
  }

  const current = currentVersionOf(proposal)!;
  const bumpVersion = proposal.status !== "DRAFT";
  const boq = input.boqItems ?? current.boqItems.map((b) => ({
    category: b.category,
    item: b.item,
    specification: b.specification ?? undefined,
    unit: b.unit,
    qty: Number(b.qty),
    rate: Number(b.rate),
    amount: Number(b.amount),
    aiSuggested: b.aiSuggested,
  }));
  const totals = computeTotals(boq);

  return prisma.$transaction(async (tx) => {
    const versionData = {
      technicalText: input.technicalText ?? current.technicalText,
      coverLetter: input.coverLetter ?? current.coverLetter,
      pointsToNote: input.pointsToNote ?? current.pointsToNote,
      technologyExplainer: input.technologyExplainer ?? current.technologyExplainer,
      technicalSpecs: input.technicalSpecs ?? (current.technicalSpecs as Prisma.InputJsonValue),
      electricalLoad: input.electricalLoad ?? (current.electricalLoad as Prisma.InputJsonValue),
      // MERGED, never overwritten, at TWO levels:
      //   • omitted entirely → keep what's stored (the documented failure mode: a
      //     partial save such as the standalone "Save write-up" button must not blank it)
      //   • supplied partially → shallow-merge over what's stored, because this is a
      //     bag of independent document sections. The creation wizard sends only the
      //     capacity calculation; without this merge that single field would wipe the
      //     recommendation, flow chart, equipment list and spec sheet seeded from the
      //     technology template moments earlier.
      // A section is cleared by sending it explicitly empty, not by omitting it.
      // Validated against THIS proposal's type, so a BOQ payload can't land on a
      // Project Report (and Zod strips anything the type's schema doesn't define).
      documentData:
        input.documentData !== undefined
          ? (parseDocumentData(proposal.proposalType, {
              ...((current.documentData as Record<string, unknown>) ?? {}),
              ...(input.documentData as Record<string, unknown>),
            }) as Prisma.InputJsonValue)
          : (current.documentData as Prisma.InputJsonValue),
      scopeOfWork: input.scopeOfWork ?? (current.scopeOfWork as Prisma.InputJsonValue),
      terms: input.terms ?? (current.terms as Prisma.InputJsonValue),
      paymentTerms: input.paymentTerms ?? (current.paymentTerms as Prisma.InputJsonValue),
      validityDays: input.validityDays ?? current.validityDays,
      subtotal: totals.subtotal.toFixed(2),
      gstAmount: totals.gst.toFixed(2),
      grandTotal: totals.grand.toFixed(2),
      // estimatedCost is admin-only; ignore any employee-supplied value.
      estimatedCost:
        ctx.role === "ADMIN" && input.estimatedCost !== undefined
          ? input.estimatedCost === null
            ? null
            : new Decimal(input.estimatedCost).toFixed(2)
          : current.estimatedCost,
      changeNote: input.changeNote,
    };

    let versionId: string;
    if (bumpVersion) {
      const newNo = proposal.currentVersion + 1;
      const v = await tx.proposalVersion.create({
        data: {
          proposalId,
          versionNo: newNo,
          ...versionData,
          boqItems: { create: boq.map((b) => ({ ...b, amount: b.amount ?? b.qty * b.rate })) },
        },
      });
      await tx.proposal.update({ where: { id: proposalId }, data: { currentVersion: newNo } });
      versionId = v.id;
    } else {
      await tx.bOQItem.deleteMany({ where: { versionId: current.id } });
      await tx.proposalVersion.update({
        where: { id: current.id },
        data: {
          ...versionData,
          boqItems: { create: boq.map((b) => ({ ...b, amount: b.amount ?? b.qty * b.rate })) },
        },
      });
      versionId = current.id;
    }

    await logAudit(
      ctx,
      { action: "UPDATE", entity: "ProposalVersion", entityId: versionId, after: { bumpVersion } },
      tx,
    );
    return { versionId };
  });
}

/** Retrieve compact summaries of past WON proposals in a nearby KLD band. */
async function retrieveWonContext(ctx: Ctx, kld?: number): Promise<string> {
  if (!kld) return "";
  const won = await prisma.proposal.findMany({
    where: {
      companyId: ctx.companyId,
      status: "WON",
      capacityKLD: { gte: kld * 0.5, lte: kld * 1.5 },
    },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    take: 3,
  });
  return won
    .map((p) => {
      const v = p.versions[0];
      return v
        ? `- ${p.plantType} ${p.capacityKLD} KLD (${p.technology}): grand total ₹${v.grandTotal}`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Same retrieval + A14 win-rate calibration used by both the batch and streaming generators. */
async function buildGenerationInput(ctx: Ctx, input: AiProposalInput): Promise<AiProposalInput> {
  let context = await retrieveWonContext(ctx, input.capacityKLD);
  // A14 — calibrate on this plant-type + KLD-band win rate.
  if (input.plantType && input.capacityKLD) {
    const { bandWinRate } = await import("@/server/automations/winloss-learning");
    const wr = await bandWinRate(ctx.companyId, input.plantType, input.capacityKLD);
    if (wr.total > 0) context = `${context}\nWin rate in this ${input.plantType} ${input.capacityKLD} KLD band: ${Math.round(wr.rate * 100)}% (${wr.won}/${wr.total} won).`;
  }
  return { ...input, pastWon: context || undefined };
}

/** Persist a generated draft into the current version + mark it AI-generated.
 *  Tenant/role-scoped via saveVersion — this is the sole write path for both generators. */
async function persistGeneratedDraft(ctx: Ctx, proposalId: string, draft: AiProposalDraft) {
  await saveVersion(ctx, proposalId, {
    technicalText: draft.technicalText,
    coverLetter: draft.coverLetter,
    pointsToNote: draft.pointsToNote,
    technologyExplainer: draft.technologyExplainer,
    technicalSpecs: draft.technicalSpecs as never,
    electricalLoad: draft.electricalLoad as never,
    scopeOfWork: draft.scopeOfWork as never,
    paymentTerms: draft.paymentTerms as never,
    boqItems: draft.boqItems.map((b) => ({ ...b, aiSuggested: true })) as never,
  });
  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  if (proposal) {
    await prisma.proposalVersion.updateMany({
      where: { proposalId, versionNo: proposal.currentVersion },
      data: { aiGenerated: true },
    });
  }
}

/** Run the AI generator and write the draft into the current version. */
export async function generateForProposal(ctx: Ctx, proposalId: string, input: AiProposalInput) {
  const draft = await generateProposalDraft(await buildGenerationInput(ctx, input));
  await persistGeneratedDraft(ctx, proposalId, draft);
  return { source: draft.source };
}

/**
 * "AI-tailor T&Cs" — the second of the two T&Cs paths the client asked for (the first is
 * the fixed `Company.standardTermsTemplate`, reset via the editor's Reset button). Adapts
 * the standard template's wording to this specific deal (plant type/technology/capacity).
 * Not part of generateProposalDraft/DRAFT_SCHEMA — a separate, lightweight llmText call so
 * this doesn't reopen the structured draft schema. Degrades cleanly: no provider configured
 * → returns the template unchanged (never throws, never blanks the field).
 */
export async function generateTermsDraft(
  ctx: Ctx,
  proposalId: string,
): Promise<{ text: string; source: "ai" | "template" }> {
  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  if (!proposal) throw new Error("Proposal not found");
  const { standardTermsTemplate } = await getCompanySettings(ctx.companyId);

  const res = await llmText(
    "You are a contracts assistant for Green Ecocare, a wastewater treatment plant contractor in India. Adapt the given standard Terms & Conditions template to the specific deal described, keeping the same section structure and legal intent, tightening/adding only what's relevant to this plant type and technology. Return plain text only — no markdown, no preamble.",
    `Standard template:\n${standardTermsTemplate}\n\nDeal: ${proposal.plantType} plant, ${proposal.technology} technology, ${proposal.capacityKLD || "unspecified"} KLD capacity, project "${proposal.projectName}".`,
    { maxTokens: 2000 },
  );
  return res ? { text: res.text, source: "ai" } : { text: standardTermsTemplate, source: "template" };
}

/**
 * Generate an AI plant/process illustration for the proposal's current version and
 * store it (admin-only, audited). Gemini-only — none of the other configured text
 * providers (Claude/Groq) support image output, so this doesn't go through the
 * provider-agnostic llm.ts fan-out. Degrades cleanly: no GEMINI_API_KEY, a network
 * failure, or a response with no image all just throw a clear error the button can
 * toast — never a half-saved state (the version isn't touched until the image bytes
 * are already durably stored).
 *
 * NOTE: the exact Gemini image-generation response shape is unverified against a
 * live key in this environment (no key configured here) — geminiGenerateImage reads
 * both camelCase/snake_case field names defensively, but if Google's actual response
 * differs further, or GEMINI_IMAGE_MODEL's default guess is stale/renamed, correct the
 * model string in Settings → Integrations (no code change needed) or fix the parsing.
 */
export type GenerateProposalImageResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Returns a result object instead of throwing for every *expected* failure (no key,
 * quota/billing, no image in response) — Next.js redacts thrown Server Action error
 * messages in production builds (replaced with a generic "Server Components render"
 * message + digest, by design, to avoid leaking internals), so a thrown Error here
 * NEVER reaches the browser as the specific, actionable text a user needs — it only
 * ever worked in local dev, where Next doesn't redact. requireAdmin still throws: an
 * auth boundary, not a message this button is meant to explain.
 */
export async function generateProposalImage(ctx: Ctx, proposalId: string): Promise<GenerateProposalImageResult> {
  requireAdmin(ctx);
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  if (!proposal) return { ok: false, error: "Proposal not found" };
  const version = proposal.versions.find((v) => v.versionNo === proposal.currentVersion) ?? proposal.versions[0];
  if (!version) return { ok: false, error: "This proposal has no version yet" };

  const config = await loadConfig(ctx.companyId);
  if (!config.GEMINI_API_KEY) {
    return { ok: false, error: "No Gemini API key configured — add one in Settings → Integrations to enable AI images" };
  }

  const prompt =
    `A clean, professional technical illustration of a ${proposal.plantType} (wastewater treatment plant) using ` +
    `${proposal.technology} technology, sized for ${proposal.capacityKLD || "a mid-size"} KLD capacity. ` +
    `Industrial engineering-diagram style: labelled process flow (inlet, treatment stages, clarifier, outlet), ` +
    `clean white background, no text noise, suitable for a client-facing proposal document.`;

  const img = await geminiGenerateImage(config.GEMINI_API_KEY, config.GEMINI_IMAGE_MODEL, prompt);
  if (!img.ok) return { ok: false, error: img.reason };

  const ext = img.mimeType.includes("png") ? "png" : img.mimeType.includes("webp") ? "webp" : "jpg";
  const key = `uploads/proposal-images/${proposalId}-${randomUUID()}.${ext}`;
  const url = await putObject(key, Buffer.from(img.base64, "base64"), img.mimeType);

  await prisma.proposalVersion.update({ where: { id: version.id }, data: { heroImageUrl: url } });
  await logAudit(ctx, { action: "UPDATE", entity: "ProposalVersion", entityId: version.id, after: { heroImageUrl: url } });
  return { ok: true, url };
}

/**
 * Streaming variant (Phase 6) — the technicalText prose streams token-by-token via
 * onToken as it's generated; BOQ/scope/terms arrive once, at the end, then everything
 * is persisted through the same saveVersion path (and its tenant/role guard) as the
 * batch generator above. A cross-tenant proposalId is rejected by saveVersion exactly
 * as it always was — streaming doesn't open a new door.
 */
export async function generateForProposalStreaming(
  ctx: Ctx,
  proposalId: string,
  input: AiProposalInput,
  onToken: (chunk: string) => void,
) {
  const draft = await streamProposalDraft(await buildGenerationInput(ctx, input), onToken);
  await persistGeneratedDraft(ctx, proposalId, draft);
  // The full draft goes back in the `done` event so the client can set state directly
  // rather than depend on a client-component prop refresh resetting already-mounted
  // local state (it doesn't — useState's initializer only runs on first mount).
  return draft;
}

/**
 * Admin "Approve & Send" (spec §7.2). Margin guard: if grandTotal <
 * estimatedCost * (1 + minMargin), require an override note. Sets status SENT.
 */
export async function approveAndSend(ctx: Ctx, proposalId: string, overrideNote?: string) {
  requireAdmin(ctx);
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: { versions: { include: { boqItems: true } } },
  });
  if (!proposal) throw new Error("Proposal not found");
  const version = currentVersionOf(proposal)!;

  if (version.estimatedCost) {
    const { minMarginPct } = await getCompanySettings(ctx.companyId);
    const floor = new Decimal(version.estimatedCost).times(1 + minMarginPct);
    if (new Decimal(version.grandTotal).lt(floor) && !overrideNote) {
      return {
        marginWarning: {
          grandTotal: version.grandTotal.toString(),
          estimatedCost: version.estimatedCost.toString(),
          requiredFloor: floor.toFixed(2),
        },
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposalVersion.update({
      where: { id: version.id },
      data: { approvedById: ctx.userId, changeNote: overrideNote ?? version.changeNote },
    });
    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: proposal.status === "DRAFT" ? "SENT" : proposal.status },
    });
    await logAudit(
      ctx,
      { action: "APPROVE", entity: "Proposal", entityId: proposalId, after: { sent: true } },
      tx,
    );
  });

  // Confirming is also what releases the proposal to the team (see
  // proposal-visibility.ts), so this is where the employee who asked for it finds
  // out. Best-effort + after the transaction: a notification must never roll back
  // an approval that already committed.
  if (proposal.status === "DRAFT") {
    const { notifyRequesterOfConfirmedProposal } = await import("./proposal-request");
    await notifyRequesterOfConfirmedProposal(ctx, proposalId, proposal.number).catch(() => {});
  }
  return { sent: true };
}

export async function markLost(ctx: Ctx, proposalId: string, reason: string) {
  requireAdmin(ctx);
  if (!reason) throw new Error("Lost reason is required (feeds the AI learning loop)");
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, companyId: ctx.companyId },
    });
    if (!proposal) throw new Error("Proposal not found");
    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "LOST", lostReason: reason },
    });
    await recordProposalOutcome(tx, ctx.companyId, proposalId, "LOST", reason); // A14
    await logAudit(ctx, { action: "UPDATE", entity: "Proposal", entityId: proposalId, after: { status: "LOST" } }, tx);
    return { ok: true };
  });
}

/**
 * Won transition (spec §7.2), single transaction: create Order (copy
 * client/value/milestones), create SITE Location, seed Budget from estimatedCost,
 * seed 9 default Stages, lock proposal WON. Payment milestones derived from the
 * winning version's paymentTerms percentages × project value.
 */
export async function markWon(
  ctx: Ctx,
  proposalId: string,
  opts?: { startDate?: Date; targetDate?: Date },
) {
  requireAdmin(ctx);
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: {
      versions: { include: { boqItems: true } },
      order: true,
      lead: {
        select: {
          phone: true,
          customerName: true,
          email: true,
          address: true,
          state: true,
          contacts: { select: { id: true } },
        },
      },
    },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.order) return { orderId: proposal.order.id, already: true };
  const version = currentVersionOf(proposal)!;
  if (!version.approvedById) throw new Error("Approve the proposal before marking it Won");

  const projectValue = new Decimal(version.grandTotal);
  const year = new Date().getFullYear();
  const terms = (version.paymentTerms as Array<{ description: string; percent: number; trigger: string }>) ?? [];

  return prisma.$transaction(async (tx) => {
    // Find-or-create the Client by exact name match (same identity key
    // listClientCustomers already groups leads by) — a repeat customer's new
    // project attaches to their existing Client row instead of duplicating it.
    const client =
      (await tx.client.findFirst({ where: { companyId: ctx.companyId, name: proposal.lead.customerName } })) ??
      (await tx.client.create({
        data: {
          companyId: ctx.companyId,
          name: proposal.lead.customerName,
          phone: proposal.lead.phone,
          email: proposal.lead.email,
          address: proposal.lead.address,
          state: proposal.lead.state,
        },
      }));
    if (proposal.lead.contacts.length) {
      await tx.contactPerson.updateMany({
        where: { id: { in: proposal.lead.contacts.map((c) => c.id) } },
        data: { clientId: client.id },
      });
    }

    const orderNo = await allocateNumber(tx, ctx.companyId, "ORDER", year);
    const order = await tx.order.create({
      data: {
        companyId: ctx.companyId,
        orderNo,
        proposalId,
        clientId: client.id,
        clientName: proposal.projectName,
        siteAddress: proposal.siteAddress,
        clientPhone: proposal.lead.phone, // A4 payment reminders read this; was left null → reminders skipped every new order
        projectValue: projectValue.toFixed(2),
        startDate: opts?.startDate,
        targetDate: opts?.targetDate,
        status: "ACTIVE",
      },
    });

    // SITE location for stock.
    await tx.location.create({
      data: { companyId: ctx.companyId, type: "SITE", name: orderNo, orderId: order.id },
    });

    // Budget seeded from estimatedCost (falls back to 70% of value if unset).
    const baseAmount = version.estimatedCost
      ? new Decimal(version.estimatedCost)
      : projectValue.times(0.7);
    await tx.budget.create({
      data: { orderId: order.id, baseAmount: baseAmount.toFixed(2), adjustments: [] },
    });

    // 9 default stages.
    await tx.stage.createMany({
      data: DEFAULT_STAGES.map((name, i) => ({ orderId: order.id, seq: i + 1, name })),
    });

    // Payment milestones from paymentTerms.
    await tx.paymentMilestone.createMany({
      data: terms.map((t, i) => ({
        orderId: order.id,
        seq: i + 1,
        description: t.description,
        amount: projectValue.times(t.percent).div(100).toDecimalPlaces(2).toFixed(2),
        dueBasis: t.trigger === "STAGE_COMPLETION" ? "STAGE_COMPLETION" : "DATE",
        status: "UPCOMING" as const,
      })),
    });

    await tx.proposal.update({ where: { id: proposalId }, data: { status: "WON" } });
    await recordProposalOutcome(tx, ctx.companyId, proposalId, "WON", null); // A14
    await logAudit(
      ctx,
      { action: "APPROVE", entity: "Order", entityId: order.id, after: { orderNo } },
      tx,
    );
    return { orderId: order.id, orderNo, already: false };
  });
}

export interface ProposalFilters {
  status?: string; // a ProposalStatus, or the computed "expired" view
  search?: string;
  cursor?: string;
  take?: number;
}

/**
 * List proposals with cursor pagination + search + a computed EXPIRED view
 * (before this the service hard-capped at 100 rows — older proposals were
 * invisible, the same class of bug fixed for leads in v7). Each row carries a
 * derived `expiry`. The "expired" filter is a worklist (live quotes past
 * validity), computed in JS since validity is per-version.
 */
export async function listProposals(ctx: Ctx, filters: ProposalFilters = {}) {
  // "expired"/"active"/"revised" are computed worklist views (derive, don't
  // duplicate-store — same approach as EXPIRED itself), not persisted statuses.
  const expiredView = filters.status === "expired";
  const activeView = filters.status === "active";
  const revisedView = filters.status === "revised";
  const computedView = expiredView || activeView || revisedView;
  const take = Math.min(filters.take ?? 50, 100);

  const where: Prisma.ProposalWhereInput = {
    companyId: ctx.companyId,
    ...visibleProposalWhere(ctx),
    ...(expiredView || activeView
      ? { status: { in: ["SENT", "UNDER_NEGOTIATION"] } }
      : revisedView
        ? { status: { notIn: ["WON", "LOST"] }, currentVersion: { gt: 1 } }
        : filters.status
          ? { status: filters.status as Prisma.EnumProposalStatusFilter["equals"] }
          : {}),
    ...(filters.search
      ? {
          OR: [
            { projectName: { contains: filters.search, mode: "insensitive" } },
            { number: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.proposal.findMany({
    where,
    include: {
      versions: { orderBy: { versionNo: "desc" }, take: 1 },
      order: { select: { id: true, orderNo: true } },
    },
    orderBy: { createdAt: "desc" },
    take: computedView ? 300 : take + 1,
    ...(filters.cursor && !computedView ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const withExpiry = stripPricing(rows, ctx.role).map((p) => {
    const v = p.versions[0];
    return {
      ...p,
      expiry: v ? proposalExpiry({ status: p.status, versionCreatedAt: v.createdAt, validityDays: v.validityDays }) : null,
    };
  });

  if (expiredView) {
    return { items: withExpiry.filter((p) => p.expiry?.state === "expired"), nextCursor: null };
  }
  if (activeView) {
    // "Active" = genuinely still in play — SENT/UNDER_NEGOTIATION but not already stale.
    return { items: withExpiry.filter((p) => p.expiry?.state !== "expired"), nextCursor: null };
  }
  if (revisedView) {
    return { items: withExpiry, nextCursor: null };
  }
  const hasMore = withExpiry.length > take;
  const items = hasMore ? withExpiry.slice(0, take) : withExpiry;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export interface ProposalAnalytics {
  total: number;
  funnel: { status: string; count: number }[];
  won: number;
  lost: number;
  open: number;
  winRatePct: number | null; // by count of closed (won / won+lost)
  winRateByValuePct: number | null; // won ₹ / (won+lost) ₹
  avgDealSize: number; // mean grandTotal of WON
  openPipelineValue: number;
  avgCycleDays: number | null; // proposal.createdAt → order.createdAt for WON
  aiVsManual: { ai: { won: number; closed: number }; manual: { won: number; closed: number } };
  lostByReason: { reason: string; count: number }[];
  byPlantType: { plantType: string; count: number; won: number }[];
}

const PROPOSAL_FUNNEL = ["DRAFT", "SENT", "UNDER_NEGOTIATION", "WON", "LOST"];

/**
 * Proposal pipeline analytics (spec §7.2) — company-wide (proposals have no
 * owner). All figures are sell-side (grandTotal / counts); the admin-only
 * est-cost/margin is deliberately excluded so this is role-agnostic.
 */
export async function proposalAnalytics(ctx: Ctx): Promise<ProposalAnalytics> {
  const proposals = await prisma.proposal.findMany({
    where: { companyId: ctx.companyId, ...visibleProposalWhere(ctx) },
    select: {
      status: true,
      lostReason: true,
      plantType: true,
      createdAt: true,
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { grandTotal: true, aiGenerated: true } },
      order: { select: { createdAt: true } },
    },
    take: 5000,
  });

  const statusCount = new Map<string, number>();
  const reason = new Map<string, number>();
  const plant = new Map<string, { count: number; won: number }>();
  const ai = { won: 0, closed: 0 };
  const manual = { won: 0, closed: 0 };
  let won = 0,
    lost = 0,
    open = 0;
  let wonValue = new Decimal(0),
    lostValue = new Decimal(0),
    pipeline = new Decimal(0);
  let cycleSum = 0,
    cycleN = 0;

  for (const p of proposals) {
    statusCount.set(p.status, (statusCount.get(p.status) ?? 0) + 1);
    const v = p.versions[0];
    const total = v ? new Decimal(v.grandTotal) : new Decimal(0);
    const isAi = v?.aiGenerated ?? false;
    const bucket = isAi ? ai : manual;

    if (p.status === "WON") {
      won += 1;
      wonValue = wonValue.plus(total);
      bucket.won += 1;
      bucket.closed += 1;
      if (p.order) {
        cycleSum += (new Date(p.order.createdAt).getTime() - new Date(p.createdAt).getTime()) / 86_400_000;
        cycleN += 1;
      }
    } else if (p.status === "LOST") {
      lost += 1;
      lostValue = lostValue.plus(total);
      bucket.closed += 1;
      const base = (p.lostReason ?? "Unspecified").split(" — ")[0].trim() || "Unspecified";
      reason.set(base, (reason.get(base) ?? 0) + 1);
    } else if (["SENT", "UNDER_NEGOTIATION"].includes(p.status)) {
      open += 1;
      pipeline = pipeline.plus(total);
    }

    const pk = plant.get(p.plantType || "—") ?? { count: 0, won: 0 };
    pk.count += 1;
    if (p.status === "WON") pk.won += 1;
    plant.set(p.plantType || "—", pk);
  }

  const closed = won + lost;
  const closedValue = wonValue.plus(lostValue);
  return {
    total: proposals.length,
    funnel: PROPOSAL_FUNNEL.filter((s) => statusCount.has(s)).map((s) => ({ status: s, count: statusCount.get(s)! })),
    won,
    lost,
    open,
    winRatePct: closed > 0 ? Math.round((won / closed) * 100) : null,
    winRateByValuePct: closedValue.gt(0) ? Math.round(wonValue.div(closedValue).times(100).toNumber()) : null,
    avgDealSize: won > 0 ? Math.round(wonValue.div(won).toNumber()) : 0,
    openPipelineValue: Math.round(pipeline.toNumber()),
    avgCycleDays: cycleN > 0 ? Math.round(cycleSum / cycleN) : null,
    aiVsManual: { ai, manual },
    lostByReason: [...reason.entries()].map(([r, count]) => ({ reason: r, count })).sort((a, b) => b.count - a.count),
    byPlantType: [...plant.entries()].map(([p, v]) => ({ plantType: p, ...v })).sort((a, b) => b.count - a.count),
  };
}

/** Pipeline KPIs for the proposals header. Pipeline ₹ is a sell-side total (visible to all). */
export async function proposalStats(ctx: Ctx) {
  const [draft, won, live] = await Promise.all([
    // Drafts are office-only, so an employee's "awaiting finalisation" tile is always
    // 0 (and the page hides the tile entirely) rather than teasing a count they can't open.
    ctx.role === "ADMIN"
      ? prisma.proposal.count({ where: { companyId: ctx.companyId, status: "DRAFT" } })
      : Promise.resolve(0),
    prisma.proposal.count({ where: { companyId: ctx.companyId, status: "WON" } }),
    prisma.proposal.findMany({
      where: { companyId: ctx.companyId, status: { in: ["SENT", "UNDER_NEGOTIATION"] } },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    }),
  ]);
  let pipeline = new Decimal(0);
  let expiring = 0;
  for (const p of live) {
    const v = p.versions[0];
    if (!v) continue;
    pipeline = pipeline.plus(v.grandTotal);
    const e = proposalExpiry({ status: p.status, versionCreatedAt: v.createdAt, validityDays: v.validityDays });
    if (e?.state === "expiring" || e?.state === "expired") expiring += 1;
  }
  return { inPlay: live.length, draft, won, expiring, pipelineValue: Math.round(pipeline.toNumber()) };
}

/**
 * Manual lifecycle transition (spec §7.2): move a live quote into
 * UNDER_NEGOTIATION, or reopen a LOST one. Fixes the two dead statuses. Admin
 * only (like approve/won/lost); WON is terminal. Reopening clears the lost reason.
 */
export async function setProposalStatus(
  ctx: Ctx,
  proposalId: string,
  status: "SENT" | "UNDER_NEGOTIATION",
) {
  requireAdmin(ctx);
  const p = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  if (!p) throw new Error("Proposal not found");
  if (p.status === "WON") throw new Error("A won proposal is locked");
  if (p.status === "DRAFT") throw new Error("Approve & send the proposal before changing its stage");

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status, lostReason: p.status === "LOST" ? null : p.lostReason },
  });
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Proposal",
    entityId: proposalId,
    before: { status: p.status },
    after: { status },
  });
  return { ok: true };
}
