import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { allocateNumber } from "./numbering";
import { recordProposalOutcome } from "@/server/automations/winloss-learning";
import { generateProposalDraft, type AiProposalInput } from "@/lib/ai";
import { DEFAULT_STAGES } from "@/lib/constants";
import { proposalExpiry } from "@/lib/domain/proposal-aging";
import { formatINR } from "@/lib/money";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";

const GST_RATE = 18;

export async function getProposal(ctx: Ctx, id: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      lead: { select: { id: true, phone: true, customerName: true } },
      order: { select: { id: true, orderNo: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        include: { boqItems: { orderBy: { category: "asc" } } },
      },
      followUps: { orderBy: { datetime: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!proposal) return null;
  return stripPricing(proposal, ctx.role);
}

/** Attach an already-uploaded document (url/name from /api/uploads) to a proposal. */
export async function addProposalDocument(ctx: Ctx, proposalId: string, doc: { url: string; name: string }) {
  const p = await prisma.proposal.findFirst({ where: { id: proposalId, companyId: ctx.companyId } });
  if (!p) throw new Error("Proposal not found");
  const created = await prisma.proposalDocument.create({
    data: { companyId: ctx.companyId, proposalId, url: doc.url, name: doc.name, createdById: ctx.userId },
  });
  await logAudit(ctx, { action: "CREATE", entity: "ProposalDocument", entityId: created.id, after: { proposalId, name: doc.name } });
  return created;
}

export async function deleteProposalDocument(ctx: Ctx, docId: string) {
  const doc = await prisma.proposalDocument.findFirst({ where: { id: docId, companyId: ctx.companyId } });
  if (!doc) throw new Error("Document not found");
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
  return { sent: res.sent, status: comm.sentStatus };
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
  },
) {
  const proposal = await prisma.proposal.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "WON" || proposal.status === "LOST") {
    throw new Error("Proposal is locked");
  }
  const updated = await prisma.proposal.update({ where: { id }, data });
  await logAudit(ctx, { action: "UPDATE", entity: "Proposal", entityId: id, after: data });
  return stripPricing(updated, ctx.role);
}

interface VersionSaveInput {
  technicalText?: string;
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
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: ctx.companyId },
    include: { versions: { include: { boqItems: true } } },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "WON" || proposal.status === "LOST") throw new Error("Proposal is locked");
  if (ctx.role !== "ADMIN" && proposal.status !== "DRAFT") {
    throw new Error("Only admins can edit a sent proposal");
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

/** Run the AI generator and write the draft into the current version. */
export async function generateForProposal(ctx: Ctx, proposalId: string, input: AiProposalInput) {
  let context = await retrieveWonContext(ctx, input.capacityKLD);
  // A14 — calibrate on this plant-type + KLD-band win rate.
  if (input.plantType && input.capacityKLD) {
    const { bandWinRate } = await import("@/server/automations/winloss-learning");
    const wr = await bandWinRate(ctx.companyId, input.plantType, input.capacityKLD);
    if (wr.total > 0) context = `${context}\nWin rate in this ${input.plantType} ${input.capacityKLD} KLD band: ${Math.round(wr.rate * 100)}% (${wr.won}/${wr.total} won).`;
  }
  const draft = await generateProposalDraft({ ...input, pastWon: context || undefined });
  await saveVersion(ctx, proposalId, {
    technicalText: draft.technicalText,
    scopeOfWork: draft.scopeOfWork,
    paymentTerms: draft.paymentTerms,
    boqItems: draft.boqItems.map((b) => ({ ...b, aiSuggested: true })),
  });
  // Mark version AI-generated.
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (proposal) {
    await prisma.proposalVersion.updateMany({
      where: { proposalId, versionNo: proposal.currentVersion },
      data: { aiGenerated: true },
    });
  }
  return { source: draft.source };
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
    const floor = new Decimal(version.estimatedCost).times(1 + env.minMarginPct);
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
  return { sent: true };
}

export async function markLost(ctx: Ctx, proposalId: string, reason: string) {
  requireAdmin(ctx);
  if (!reason) throw new Error("Lost reason is required (feeds the AI learning loop)");
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "LOST", lostReason: reason },
  });
  await recordProposalOutcome(prisma, ctx.companyId, proposalId, "LOST", reason); // A14
  await logAudit(ctx, { action: "UPDATE", entity: "Proposal", entityId: proposalId, after: { status: "LOST" } });
  return { ok: true };
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
    include: { versions: { include: { boqItems: true } }, order: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.order) return { orderId: proposal.order.id, already: true };
  const version = currentVersionOf(proposal)!;
  if (!version.approvedById) throw new Error("Approve the proposal before marking it Won");

  const projectValue = new Decimal(version.grandTotal);
  const year = new Date().getFullYear();
  const terms = (version.paymentTerms as Array<{ description: string; percent: number; trigger: string }>) ?? [];

  return prisma.$transaction(async (tx) => {
    const orderNo = await allocateNumber(tx, ctx.companyId, "ORDER", year);
    const order = await tx.order.create({
      data: {
        companyId: ctx.companyId,
        orderNo,
        proposalId,
        clientName: proposal.projectName,
        siteAddress: proposal.siteAddress,
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
  const expiredView = filters.status === "expired";
  const take = Math.min(filters.take ?? 50, 100);

  const where: Prisma.ProposalWhereInput = {
    companyId: ctx.companyId,
    ...(expiredView
      ? { status: { in: ["SENT", "UNDER_NEGOTIATION"] } }
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
    take: expiredView ? 300 : take + 1,
    ...(filters.cursor && !expiredView ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
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
    where: { companyId: ctx.companyId },
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
    prisma.proposal.count({ where: { companyId: ctx.companyId, status: "DRAFT" } }),
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

  const updated = await prisma.proposal.update({
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
  return stripPricing(updated, ctx.role);
}
