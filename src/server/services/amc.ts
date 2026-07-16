import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { stripPricing } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { allocateNumber } from "./numbering";
import { computeGst } from "@/lib/gst";
import { amountInWords, formatINR, serializeDecimals } from "@/lib/money";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import {
  generateVisitSchedule,
  visitStatusFor,
  slaDueDate,
  contractStatusFor,
  daysToExpiry,
  isSlaBreached,
} from "@/lib/domain/amc";

// ---------- Contracts ----------

export interface ContractFilters {
  status?: string; // ACTIVE | EXPIRING | EXPIRED | CANCELLED | DRAFT (endDate-aware — see contractWhere)
  search?: string;
  cursor?: string;
  take?: number;
}

const EXPIRING_WINDOW_DAYS = 60;

/**
 * Filter clause that reconciles the *persisted* status column with the *derived*
 * expiry (a contract past endDate reads EXPIRED even if the cron hasn't flipped it
 * yet). The cron (transitionAmcStatuses) persists EXPIRED over time; this keeps
 * filtering correct in between runs.
 */
function contractWhere(status: string | undefined, now: Date): Prisma.ServiceContractWhereInput {
  const soon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000);
  switch (status) {
    case "ACTIVE":
      return { status: { in: ["ACTIVE", "DRAFT"] }, endDate: { gte: now } };
    case "EXPIRING":
      return { status: "ACTIVE", endDate: { gte: now, lte: soon } };
    case "EXPIRED":
      return { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endDate: { lt: now } }] };
    case "CANCELLED":
      return { status: "CANCELLED" };
    case "DRAFT":
      return { status: "DRAFT" };
    default:
      return {};
  }
}

/**
 * List AMCs with cursor pagination + search + status filter. Before this the
 * service was an *unbounded* findMany (every contract every request). `annualValue`
 * is stripped for EMPLOYEE. Each row carries derived liveStatus + daysToExpiry.
 */
export async function listContracts(ctx: Ctx, filters: ContractFilters = {}) {
  const now = new Date();
  const take = Math.min(filters.take ?? 50, 100);
  // AND-compose so the status filter (whose EXPIRED branch uses its own OR) can't be
  // clobbered by the search OR — two OR keys in one object literal would collide.
  const where: Prisma.ServiceContractWhereInput = {
    companyId: ctx.companyId,
    AND: [
      contractWhere(filters.status, now),
      ...(filters.search
        ? [
            {
              OR: [
                { clientName: { contains: filters.search, mode: "insensitive" as const } },
                { contractNo: { contains: filters.search, mode: "insensitive" as const } },
                { siteAddress: { contains: filters.search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };
  const rows = await prisma.serviceContract.findMany({
    where,
    include: { _count: { select: { visits: true, tickets: true } } },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = stripPricing(
    page.map((c) => ({
      ...c,
      annualValue: c.annualValue.toString(),
      liveStatus: c.status === "CANCELLED" ? "CANCELLED" : c.status === "DRAFT" ? "DRAFT" : contractStatusFor(c.startDate, c.endDate, now),
      daysToExpiry: daysToExpiry(c.endDate, now),
    })),
    ctx.role,
  );
  return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

/**
 * Set an AMC's lifecycle status — makes CANCELLED reachable (and reactivate).
 * Admin only, audited. Guards invalid transitions. EXPIRED is owned by the cron
 * (transitionAmcStatuses), not set here.
 */
export async function setContractStatus(ctx: Ctx, contractId: string, status: "ACTIVE" | "CANCELLED") {
  requireAdmin(ctx);
  const contract = await prisma.serviceContract.findFirst({ where: { id: contractId, companyId: ctx.companyId } });
  if (!contract) throw new Error("Contract not found");
  if (contract.status === status) return contract;
  const updated = await prisma.serviceContract.update({ where: { id: contractId }, data: { status } });
  await logAudit(ctx, { action: "UPDATE", entity: "ServiceContract", entityId: contractId, before: { status: contract.status }, after: { status } });
  return updated;
}

export async function getContract(ctx: Ctx, id: string) {
  const c = await prisma.serviceContract.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      visits: { orderBy: { seq: "asc" } },
      tickets: { orderBy: { createdAt: "desc" } },
      order: { select: { id: true, orderNo: true, proposal: { select: { lead: { select: { email: true } } } } } },
    },
  });
  if (!c) return null;
  const now = new Date();
  const view = {
    ...c,
    annualValue: c.annualValue.toString(),
    liveStatus: c.status === "CANCELLED" ? "CANCELLED" : c.status === "DRAFT" ? "DRAFT" : contractStatusFor(c.startDate, c.endDate, now),
    daysToExpiry: daysToExpiry(c.endDate, now),
    visits: c.visits.map((v) => ({
      ...v,
      liveStatus: visitStatusFor(v.scheduledDate, v.actualDate, now),
    })),
  };
  return stripPricing(view, ctx.role);
}

export interface CreateContractInput {
  orderId?: string;
  clientName: string;
  siteAddress: string;
  startDate: Date;
  endDate: Date;
  annualValue: number;
  frequency: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
  visitsPerYear: number;
  scope?: Record<string, unknown>;
}

/** Create an AMC and auto-generate its preventive-maintenance visit schedule. */
export async function createContract(ctx: Ctx, input: CreateContractInput) {
  requireAdmin(ctx);
  const year = new Date().getFullYear();
  const schedule = generateVisitSchedule(input.startDate, input.endDate, input.visitsPerYear);

  return prisma.$transaction(async (tx) => {
    const contractNo = await allocateNumber(tx, ctx.companyId, "AMC", year);
    const contract = await tx.serviceContract.create({
      data: {
        companyId: ctx.companyId,
        contractNo,
        orderId: input.orderId || null,
        clientName: input.clientName,
        siteAddress: input.siteAddress,
        startDate: input.startDate,
        endDate: input.endDate,
        annualValue: new Decimal(input.annualValue).toFixed(2),
        frequency: input.frequency,
        visitsPerYear: input.visitsPerYear,
        scope: (input.scope ?? {}) as Prisma.InputJsonValue,
        status: "ACTIVE",
        createdById: ctx.userId,
        visits: {
          create: schedule.map((d, i) => ({ seq: i + 1, scheduledDate: d, status: "UPCOMING" })),
        },
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "ServiceContract", entityId: contract.id, after: { contractNo } }, tx);
    return { contractId: contract.id, contractNo, visits: schedule.length };
  });
}

/**
 * Renew an AMC — creates the next-term contract from an expiring/expired one
 * (copies client, site, scope, frequency, value unless overridden), links it back
 * via renewedFromId, and generates the next visit cycle. Admin only, audited. The
 * new term starts the day after the old one ends (or a provided startDate) and runs
 * the same duration by default. This is what lights up the true renewal rate.
 */
export async function renewContract(
  ctx: Ctx,
  contractId: string,
  overrides: { startDate?: Date; endDate?: Date; annualValue?: number } = {},
) {
  requireAdmin(ctx);
  const prev = await prisma.serviceContract.findFirst({ where: { id: contractId, companyId: ctx.companyId } });
  if (!prev) throw new Error("Contract not found");

  const DAY = 86_400_000;
  const start = overrides.startDate ?? new Date(prev.endDate.getTime() + DAY);
  const prevDurationMs = prev.endDate.getTime() - prev.startDate.getTime();
  const end = overrides.endDate ?? new Date(start.getTime() + prevDurationMs);
  if (end.getTime() <= start.getTime()) throw new Error("Renewal end date must be after the start date");
  const annualValue = overrides.annualValue ?? Number(prev.annualValue);
  const year = new Date().getFullYear();
  const schedule = generateVisitSchedule(start, end, prev.visitsPerYear);

  return prisma.$transaction(async (tx) => {
    const contractNo = await allocateNumber(tx, ctx.companyId, "AMC", year);
    const created = await tx.serviceContract.create({
      data: {
        companyId: ctx.companyId,
        contractNo,
        orderId: prev.orderId,
        clientName: prev.clientName,
        siteAddress: prev.siteAddress,
        startDate: start,
        endDate: end,
        annualValue: new Decimal(annualValue).toFixed(2),
        frequency: prev.frequency,
        visitsPerYear: prev.visitsPerYear,
        scope: (prev.scope ?? {}) as Prisma.InputJsonValue,
        status: "ACTIVE",
        renewedFromId: prev.id,
        createdById: ctx.userId,
        visits: { create: schedule.map((d, i) => ({ seq: i + 1, scheduledDate: d, status: "UPCOMING" })) },
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "ServiceContract", entityId: created.id, after: { contractNo, renewedFrom: prev.contractNo } }, tx);
    return { contractId: created.id, contractNo, visits: schedule.length };
  });
}

/** Complete a preventive-maintenance visit with plant readings + checklist + photos. */
export async function completeVisit(
  ctx: Ctx,
  visitId: string,
  data: {
    readings?: Record<string, unknown>;
    checklist?: Array<{ item: string; ok: boolean; note?: string }>;
    notes?: string;
    photos?: { url: string }[];
    lat?: number;
    lng?: number;
  },
) {
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id: visitId }, include: { contract: true } });
  if (!visit || visit.contract.companyId !== ctx.companyId) throw new Error("Visit not found");
  const updated = await prisma.maintenanceVisit.update({
    where: { id: visitId },
    data: {
      status: "DONE",
      actualDate: new Date(),
      readings: (data.readings ?? undefined) as Prisma.InputJsonValue,
      checklist: (data.checklist ?? undefined) as Prisma.InputJsonValue,
      notes: data.notes,
      photos: (data.photos ?? undefined) as Prisma.InputJsonValue,
      technicianId: ctx.userId,
      lat: data.lat,
      lng: data.lng,
    },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "MaintenanceVisit", entityId: visitId, after: { status: "DONE" } });
  return updated;
}

export interface AmcEvent {
  at: Date;
  kind: "created" | "visit" | "ticket" | "invoice" | "status" | "comm";
  title: string;
  detail?: string;
  amount?: string; // AMC invoice ₹ (sell-side; visible to all)
}

/**
 * Merged AMC/service timeline — the service-delivery + money-in history that was
 * invisible before. Combines: contract created → visits completed (with a readings
 * summary) → tickets raised/resolved (with SLA breach) → AMC invoices billed (₹) →
 * lifecycle status changes → client comms. Newest-first. `annualValue` is never
 * exposed here (no money field on visits/tickets); invoice ₹ is sell-side.
 */
export async function amcActivity(ctx: Ctx, id: string): Promise<AmcEvent[] | null> {
  const contract = await prisma.serviceContract.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      visits: { where: { actualDate: { not: null } }, select: { seq: true, actualDate: true, readings: true } },
      tickets: { select: { ticketNo: true, title: true, priority: true, status: true, slaDueDate: true, createdAt: true, closedAt: true } },
      communications: { select: { channel: true, direction: true, body: true, sentStatus: true, createdAt: true } },
    },
  });
  if (!contract) return null;

  const events: AmcEvent[] = [];
  events.push({ at: contract.createdAt, kind: "created", title: "Contract created", detail: contract.contractNo });

  for (const v of contract.visits) {
    const r = v.readings as Record<string, number> | null;
    const summary = r && Object.keys(r).length ? Object.entries(r).map(([k, val]) => `${k}: ${val}`).join(" · ") : undefined;
    events.push({ at: v.actualDate!, kind: "visit", title: `Visit ${v.seq} completed`, detail: summary });
  }

  for (const t of contract.tickets) {
    events.push({ at: t.createdAt, kind: "ticket", title: `Ticket raised: ${t.title}`, detail: `${t.ticketNo} · ${t.priority.toLowerCase()}` });
    if (t.closedAt) {
      const breached = t.slaDueDate ? t.closedAt.getTime() > t.slaDueDate.getTime() : false;
      events.push({ at: t.closedAt, kind: "ticket", title: `Ticket ${t.status.toLowerCase()}: ${t.title}`, detail: breached ? "SLA breached" : "within SLA" });
    }
  }

  for (const c of contract.communications) {
    const chan = c.channel.charAt(0) + c.channel.slice(1).toLowerCase();
    const dir = c.direction === "IN" ? "inbound" : "outbound";
    const status = c.sentStatus && c.sentStatus !== "SENT" ? ` · ${c.sentStatus.toLowerCase()}` : "";
    events.push({ at: c.createdAt, kind: "comm", title: `${chan} · ${dir}${status}`, detail: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body });
  }

  const audits = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, OR: [{ entity: "ServiceContract", entityId: id, action: "UPDATE" }, { entity: "Invoice", action: "CREATE" }] },
    orderBy: { createdAt: "desc" },
  });
  // AMC-invoice audit rows for THIS contract → join their ₹ totals for the money-in trail.
  const amcInvoiceAudits = audits.filter((a) => a.entity === "Invoice" && ((a.after ?? {}) as Record<string, unknown>).amc === contract.contractNo);
  const invoiceTotals = new Map<string, string>();
  if (amcInvoiceAudits.length) {
    const rows = await prisma.invoice.findMany({ where: { id: { in: amcInvoiceAudits.map((a) => a.entityId) } }, select: { id: true, total: true } });
    for (const r of rows) invoiceTotals.set(r.id, r.total.toString());
  }
  for (const a of audits) {
    const after = (a.after ?? {}) as Record<string, unknown>;
    if (a.entity === "ServiceContract" && "status" in after) {
      events.push({ at: a.createdAt, kind: "status", title: `Status → ${String(after.status)}` });
    } else if (a.entity === "Invoice" && after.amc === contract.contractNo) {
      const total = invoiceTotals.get(a.entityId);
      events.push({ at: a.createdAt, kind: "invoice", title: "AMC invoice billed", detail: String(after.invoiceNo ?? ""), amount: total ? formatINR(total) : undefined });
    }
  }

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return events;
}

// ---------- Client comms ----------

/** Resolve the AMC client contact via contract → order → proposal → lead. */
async function contractContact(ctx: Ctx, contractId: string) {
  const c = await prisma.serviceContract.findFirst({
    where: { id: contractId, companyId: ctx.companyId },
    select: { clientName: true, order: { select: { proposal: { select: { lead: { select: { phone: true, email: true } } } } } } },
  });
  if (!c) throw new Error("Contract not found");
  const lead = c.order?.proposal?.lead;
  return { name: c.clientName, phone: lead?.phone ?? null, email: lead?.email ?? null };
}

export interface LogContractCommInput {
  contractId: string;
  channel: "CALL" | "WHATSAPP" | "EMAIL";
  direction?: "OUT" | "IN";
  body: string;
  toAddress?: string;
  subject?: string;
  sentStatus?: string;
}

/** Record a communication (a touch) against an AMC contract — log path (no send). */
export async function logContractComm(ctx: Ctx, input: LogContractCommInput) {
  const c = await prisma.serviceContract.findFirst({ where: { id: input.contractId, companyId: ctx.companyId }, select: { id: true } });
  if (!c) throw new Error("Contract not found");
  if (!input.body.trim()) throw new Error("Message cannot be empty");
  const comm = await prisma.communication.create({
    data: {
      companyId: ctx.companyId,
      contractId: input.contractId,
      channel: input.channel,
      direction: input.direction ?? "OUT",
      body: input.body,
      toAddress: input.toAddress,
      subject: input.subject,
      sentStatus: input.sentStatus ?? "LOGGED",
      createdById: ctx.userId,
    },
  });
  await logAudit(ctx, { action: "CREATE", entity: "Communication", entityId: comm.id, after: { contractId: input.contractId, channel: input.channel } });
  return comm;
}

/** Send a WhatsApp to the AMC client and log it. Send gated; log always records. */
export async function sendContractWhatsApp(ctx: Ctx, contractId: string, body: string) {
  if (!body.trim()) throw new Error("Message cannot be empty");
  const contact = await contractContact(ctx, contractId);
  if (!contact.phone) throw new Error("Link the contract to a project to resolve the client's phone number");
  const res = await sendWhatsAppText(contact.phone, body);
  const sentStatus = res.sent ? "SENT" : res.transport === "none" ? "LOGGED" : "FAILED";
  const comm = await logContractComm(ctx, { contractId, channel: "WHATSAPP", direction: "OUT", body, toAddress: contact.phone, sentStatus });
  return { comm, delivery: res };
}

/** Send an email to the AMC client and log it. Send gated (Resend); log always records. */
export async function sendContractEmail(ctx: Ctx, contractId: string, subject: string, body: string) {
  const contact = await contractContact(ctx, contractId);
  if (!contact.email) throw new Error("Link the contract to a project to resolve the client's email");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and message are required");
  const html = `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`;
  const res = await sendEmail({ to: contact.email, subject, html });
  const sentStatus = res.sent ? "SENT" : "LOGGED";
  const comm = await logContractComm(ctx, { contractId, channel: "EMAIL", direction: "OUT", body, subject, toAddress: contact.email, sentStatus });
  return { comm, delivery: res };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Tickets ----------

export interface CreateTicketInput {
  contractId?: string;
  orderId?: string;
  title: string;
  description: string;
  raisedBy: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export async function createTicket(ctx: Ctx, input: CreateTicketInput) {
  const year = new Date().getFullYear();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticketNo = await allocateNumber(tx, ctx.companyId, "TICKET", year);
    const ticket = await tx.serviceTicket.create({
      data: {
        companyId: ctx.companyId,
        ticketNo,
        contractId: input.contractId || null,
        orderId: input.orderId || null,
        title: input.title,
        description: input.description,
        raisedBy: input.raisedBy,
        priority: input.priority,
        status: "OPEN",
        slaDueDate: slaDueDate(input.priority, now),
        createdById: ctx.userId,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "ServiceTicket", entityId: ticket.id, after: { ticketNo } }, tx);
    return { ticketId: ticket.id, ticketNo };
  });
}

export async function updateTicket(
  ctx: Ctx,
  ticketId: string,
  data: { status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; assignedToId?: string; resolution?: string },
) {
  const closing = data.status === "RESOLVED" || data.status === "CLOSED";
  const ticket = await prisma.serviceTicket.update({
    where: { id: ticketId },
    data: {
      status: data.status,
      assignedToId: data.assignedToId,
      resolution: data.resolution,
      closedAt: closing ? new Date() : undefined,
    },
  });
  await logAudit(ctx, { action: "UPDATE", entity: "ServiceTicket", entityId: ticketId, after: { status: data.status } });
  return ticket;
}

export interface TicketFilters {
  openOnly?: boolean;
  search?: string;
  cursor?: string;
  take?: number;
}

/** List tickets with cursor pagination (before this it was capped-but-cursorless at 100). */
export async function listTickets(ctx: Ctx, filters: TicketFilters = {}) {
  const take = Math.min(filters.take ?? 50, 100);
  const where: Prisma.ServiceTicketWhereInput = {
    companyId: ctx.companyId,
    ...(filters.openOnly ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { ticketNo: { contains: filters.search, mode: "insensitive" } },
            { raisedBy: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await prisma.serviceTicket.findMany({
    where,
    orderBy: [{ status: "asc" }, { slaDueDate: "asc" }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/**
 * Persist the derived lifecycle transitions the read layer only *computed* before
 * (spec §Phase 5): ACTIVE contracts past endDate → EXPIRED; UPCOMING visits →
 * DUE (within the grace window) or MISSED (past it). System path (cron), scoped
 * by companyId — no user ctx. Returns the counts flipped. Idempotent.
 */
export async function transitionAmcStatuses(companyId: string, now: Date = new Date(), graceDays = 7) {
  const graceCutoff = new Date(now.getTime() - graceDays * 86_400_000);
  const [expired, missed, due] = await prisma.$transaction([
    // ACTIVE contracts whose window has closed → EXPIRED.
    prisma.serviceContract.updateMany({
      where: { companyId, status: "ACTIVE", endDate: { lt: now } },
      data: { status: "EXPIRED" },
    }),
    // Un-done visits well past their date → MISSED.
    prisma.maintenanceVisit.updateMany({
      where: { contract: { companyId }, status: { in: ["UPCOMING", "DUE"] }, actualDate: null, scheduledDate: { lt: graceCutoff } },
      data: { status: "MISSED" },
    }),
    // Un-done visits inside the grace window → DUE.
    prisma.maintenanceVisit.updateMany({
      where: { contract: { companyId }, status: "UPCOMING", actualDate: null, scheduledDate: { lt: now, gte: graceCutoff } },
      data: { status: "DUE" },
    }),
  ]);
  return { contractsExpired: expired.count, visitsMissed: missed.count, visitsDue: due.count };
}

// ---------- Recurring AMC invoice (reuses GST + numbering) ----------

/** Bill one AMC period (annualValue ÷ visits-per-year) with GST. Admin only. */
export async function generateAmcInvoice(ctx: Ctx, contractId: string, periodLabel: string) {
  requireAdmin(ctx);
  const contract = await prisma.serviceContract.findFirst({ where: { id: contractId, companyId: ctx.companyId } });
  if (!contract) throw new Error("Contract not found");
  if (!contract.orderId) throw new Error("Link the contract to a project/order before invoicing AMC");

  const periodAmount = new Decimal(contract.annualValue).div(contract.visitsPerYear).toDecimalPlaces(2);
  const gst = computeGst({
    taxableAmount: periodAmount,
    supplierStateCode: env.companyStateCode,
    placeOfSupplyStateCode: env.companyStateCode,
    rate: 18,
  });
  const year = new Date().getFullYear();

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await allocateNumber(tx, ctx.companyId, "INVOICE", year);
    const invoice = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        invoiceNo,
        orderId: contract.orderId!,
        date: new Date(),
        lineItems: [
          { description: `AMC — ${contract.contractNo} (${periodLabel})`, sac: "9987", amount: gst.taxable },
        ] as Prisma.InputJsonValue,
        taxType: gst.taxType,
        gstBreakup: { cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, rate: gst.rate } as Prisma.InputJsonValue,
        total: gst.total,
        amountWords: amountInWords(gst.total),
        pdfUrl: `/print/invoice/${invoiceNo}`,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "Invoice", entityId: invoice.id, after: { invoiceNo, amc: contract.contractNo } }, tx);
    return { invoiceId: invoice.id, invoiceNo, amount: serializeDecimals(gst.total) };
  });
}

// ---------- Analytics ----------

export interface AmcAnalytics {
  totalContracts: number;
  funnel: { status: string; count: number }[]; // ACTIVE / EXPIRING / EXPIRED / CANCELLED (derived, endDate-aware)
  active: number;
  expiringPipeline: number; // ACTIVE + endDate ≤ 90d — the renewal pipeline
  expiredContracts: number; // lapsed (derived EXPIRED)
  renewedContracts: number; // lapsed contracts that were renewed (are a renewedFrom source)
  renewalRatePct: number | null; // renewedContracts ÷ expiredContracts
  byFrequency: { frequency: string; count: number }[]; // active only
  recurringRevenue: number | null; // Σ active annualValue — sell-side, admin-only (null for EMPLOYEE)
  visitsDone: number;
  visitsMissed: number;
  visitCompliancePct: number | null; // done ÷ (done + missed), terminal visits only
  ticketsTotal: number;
  ticketsOpen: number;
  ticketsBreached: number;
  slaBreachPct: number | null; // breached ÷ total
}

const AMC_FUNNEL = ["ACTIVE", "EXPIRING", "EXPIRED", "CANCELLED"];

/**
 * AMC/service analytics (spec §Phase 5) — recurring-revenue run-rate, schedule
 * compliance, and SLA health. Company-wide. Contract status is derived endDate-aware
 * (matches the list), visit compliance + SLA breach use the same domain helpers the
 * UI shows. `recurringRevenue` is sell-side + admin-only (the only money surfaced).
 */
export async function amcAnalytics(ctx: Ctx): Promise<AmcAnalytics> {
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * 86_400_000);
  const [contracts, visits, tickets] = await Promise.all([
    prisma.serviceContract.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, status: true, startDate: true, endDate: true, annualValue: true, frequency: true, renewedFromId: true },
    }),
    prisma.maintenanceVisit.findMany({
      where: { contract: { companyId: ctx.companyId } },
      select: { scheduledDate: true, actualDate: true },
    }),
    prisma.serviceTicket.findMany({
      where: { companyId: ctx.companyId },
      select: { slaDueDate: true, status: true, closedAt: true },
    }),
  ]);

  // Contracts that have been renewed = the set of ids that appear as a renewedFrom source.
  const renewedSourceIds = new Set(contracts.map((c) => c.renewedFromId).filter((x): x is string => !!x));

  const statusCount = new Map<string, number>();
  const freqCount = new Map<string, number>();
  let active = 0,
    expiringPipeline = 0,
    expiredContracts = 0,
    renewedContracts = 0;
  let recurring = new Decimal(0);
  for (const c of contracts) {
    const live =
      c.status === "CANCELLED" || c.status === "DRAFT"
        ? c.status
        : contractStatusFor(c.startDate, c.endDate, now); // ACTIVE | EXPIRED
    // "EXPIRING" is a sub-bucket of ACTIVE (endDate ≤ 90d), reported separately in the funnel.
    const bucket = live === "ACTIVE" && c.endDate.getTime() <= soon.getTime() ? "EXPIRING" : live;
    statusCount.set(bucket, (statusCount.get(bucket) ?? 0) + 1);
    if (live === "ACTIVE") {
      active += 1;
      recurring = recurring.plus(new Decimal(c.annualValue));
      freqCount.set(c.frequency, (freqCount.get(c.frequency) ?? 0) + 1);
      if (bucket === "EXPIRING") expiringPipeline += 1;
    } else if (live === "EXPIRED") {
      expiredContracts += 1;
      if (renewedSourceIds.has(c.id)) renewedContracts += 1;
    }
  }

  let visitsDone = 0,
    visitsMissed = 0;
  for (const v of visits) {
    const s = visitStatusFor(v.scheduledDate, v.actualDate, now);
    if (s === "DONE") visitsDone += 1;
    else if (s === "MISSED") visitsMissed += 1;
  }
  const terminal = visitsDone + visitsMissed;

  let ticketsOpen = 0,
    ticketsBreached = 0;
  for (const t of tickets) {
    const resolved = t.status === "RESOLVED" || t.status === "CLOSED";
    if (!resolved) ticketsOpen += 1;
    // Resolved late (closedAt past SLA) OR still-open past SLA both count as a breach.
    const breached = resolved
      ? Boolean(t.slaDueDate && t.closedAt && t.closedAt.getTime() > t.slaDueDate.getTime())
      : isSlaBreached(t.slaDueDate, false, now);
    if (breached) ticketsBreached += 1;
  }

  return {
    totalContracts: contracts.length,
    funnel: AMC_FUNNEL.filter((s) => statusCount.has(s)).map((s) => ({ status: s, count: statusCount.get(s)! })),
    active,
    expiringPipeline,
    expiredContracts,
    renewedContracts,
    renewalRatePct: expiredContracts > 0 ? Math.round((renewedContracts / expiredContracts) * 100) : null,
    byFrequency: [...freqCount.entries()].map(([frequency, count]) => ({ frequency, count })),
    recurringRevenue: ctx.role === "ADMIN" ? Math.round(recurring.toNumber()) : null,
    visitsDone,
    visitsMissed,
    visitCompliancePct: terminal > 0 ? Math.round((visitsDone / terminal) * 100) : null,
    ticketsTotal: tickets.length,
    ticketsOpen,
    ticketsBreached,
    slaBreachPct: tickets.length > 0 ? Math.round((ticketsBreached / tickets.length) * 100) : null,
  };
}

// ---------- Dashboard ----------

export async function amcDashboard(ctx: Ctx) {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const soon = new Date(now.getTime() + 60 * 86_400_000);

  const [contracts, dueVisits, openTickets, expiring] = await Promise.all([
    // endDate-aware so this tile == the ?status=ACTIVE list it links to (see contractWhere).
    prisma.serviceContract.findMany({ where: { companyId: ctx.companyId, status: "ACTIVE", endDate: { gte: now } }, select: { annualValue: true } }),
    prisma.maintenanceVisit.count({
      where: { contract: { companyId: ctx.companyId }, status: { in: ["UPCOMING", "DUE"] }, scheduledDate: { lte: monthEnd } },
    }),
    prisma.serviceTicket.count({ where: { companyId: ctx.companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.serviceContract.count({ where: { companyId: ctx.companyId, status: "ACTIVE", endDate: { lte: soon, gte: now } } }),
  ]);

  const base = {
    activeContracts: contracts.length,
    visitsDueThisMonth: dueVisits,
    openTickets,
    expiringSoon: expiring,
  };
  if (ctx.role !== "ADMIN") return base;
  const amcAnnualRevenue = contracts.reduce<Decimal>((a, c) => a.plus(c.annualValue), new Decimal(0)).toFixed(2);
  return { ...base, amcAnnualRevenue };
}
