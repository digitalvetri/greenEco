import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { renderDocPdf, renderDocHtml } from "@/lib/pdf";
import { putObject } from "@/lib/storage";
import { getCompanySettings } from "./company-settings";

/**
 * Generate a real, durable PDF for a document and persist it (Phase 1).
 *
 * Until now `pdfUrl` pointed at the auth-gated /print/* HTML view, which can't
 * be attached to a WhatsApp/email. This renders that same branded page to PDF
 * bytes and stores them (local in dev, S3/R2 in prod) at a stable key, then
 * records the durable URL on the document. Admin-only — these carry pricing.
 *
 * Lazy by design: called on an explicit "Generate PDF" action, never inside
 * document creation (Chromium spin-up is ~1–2s and there is no queue yet).
 */

export type PdfDocType = "invoice" | "proposal" | "closeout" | "po" | "payment-statement";

interface Resolved {
  printPath: string;
  storageKey: string;
  /** Set for multi-page documents that need a running header + "Page | N" footer. */
  runningHeader?: string;
  /** Persist the durable URL back onto the source record, if it has a field. */
  persist?: (url: string) => Promise<void>;
}

/**
 * The stored PDF URL is served WITHOUT auth on purpose — a customer receiving an
 * invoice link on WhatsApp has no login. So the URL itself is the capability:
 * an unguessable random segment (like saveUpload) prevents enumeration of the
 * sequential invoice/order numbers. Never key a public artifact on a guessable id.
 */
function randomKey(prefix: string, hint: string): string {
  return `pdfs/${prefix}/${hint}-${randomUUID()}.pdf`;
}

async function resolve(ctx: Ctx, docType: PdfDocType, docId: string): Promise<Resolved> {
  switch (docType) {
    case "invoice": {
      // docId is the invoiceNo (the print route keys on it).
      const inv = await prisma.invoice.findFirst({
        where: { invoiceNo: docId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (!inv) throw new Error("Invoice not found");
      return {
        printPath: `/print/invoice/${docId}`,
        storageKey: randomKey("invoice", docId),
        persist: async (url) => {
          await prisma.invoice.update({ where: { id: inv.id }, data: { pdfUrl: url } });
        },
      };
    }
    case "proposal": {
      const p = await prisma.proposal.findFirst({
        where: { id: docId, companyId: ctx.companyId },
        select: { id: true, currentVersion: true, proposalType: true },
      });
      if (!p) throw new Error("Proposal not found");
      // Only the MULTI-PAGE formats carry the client's running letterhead and
      // "Page | N" footer. The Service proforma is deliberately excluded even though
      // it is a structured format: their sample is a single page with its own header
      // block, so a running header would print a second letterhead on top of it.
      const multiPage =
        p.proposalType === "Project Proposal" ||
        p.proposalType === "BOQ Proposal" ||
        p.proposalType === "AMC Proposal";
      const company = multiPage ? await getCompanySettings(ctx.companyId) : null;
      return {
        printPath: `/print/proposal/${docId}`,
        storageKey: randomKey("proposal", `${docId}-v${p.currentVersion}`),
        runningHeader: company?.name,
        persist: async (url) => {
          await prisma.proposalVersion.updateMany({
            where: { proposalId: p.id, versionNo: p.currentVersion },
            data: { pdfUrl: url },
          });
        },
      };
    }
    case "closeout": {
      // docId is the order id; closeout is derived (no own pdfUrl field).
      const order = await prisma.order.findFirst({
        where: { id: docId, companyId: ctx.companyId },
        select: { id: true, orderNo: true },
      });
      if (!order) throw new Error("Order not found");
      return {
        printPath: `/print/closeout/${docId}`,
        storageKey: randomKey("closeout", order.orderNo),
      };
    }
    case "payment-statement": {
      // docId is the order id; derived (no own pdfUrl field), same as closeout.
      const order = await prisma.order.findFirst({
        where: { id: docId, companyId: ctx.companyId },
        select: { id: true, orderNo: true },
      });
      if (!order) throw new Error("Order not found");
      return {
        printPath: `/print/payment-statement/${docId}`,
        storageKey: randomKey("payment-statement", order.orderNo),
      };
    }
    case "po": {
      // docId is the poNo (the print route keys on it, matching invoice's convention).
      const po = await prisma.purchaseOrder.findFirst({
        where: { poNo: docId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (!po) throw new Error("Purchase order not found");
      return {
        printPath: `/print/po/${docId}`,
        storageKey: randomKey("po", docId),
        persist: async (url) => {
          await prisma.purchaseOrder.update({ where: { id: po.id }, data: { pdfUrl: url } });
        },
      };
    }
  }
}

/**
 * Generate + store the document as an editable Word file.
 *
 * Converted from the SAME rendered page the PDF comes from, so the two can never
 * drift — there is no second template to keep in step. Word repaginates on open, so
 * the layout is a faithful port rather than a pixel copy: the sections, tables,
 * numbering, fonts and figures are all preserved, but a page break may land
 * differently. That is the point of the Word version — it is the editable one.
 */
export async function generateDocx(
  ctx: Ctx,
  docType: PdfDocType,
  docId: string,
): Promise<{ url: string; bytes: number }> {
  requireAdmin(ctx);
  const { printPath, storageKey, runningHeader } = await resolve(ctx, docType, docId);

  const html = await renderDocHtml(
    { docType, docId, printPath, runningHeader },
    { userId: ctx.userId, role: ctx.role, companyId: ctx.companyId },
  );

  const { default: HTMLtoDOCX } = await import("html-to-docx");
  const buf = (await HTMLtoDOCX(html, null, {
    // A4 in twips, with the same margins the PDF uses.
    pageSize: { width: 11906, height: 16838 },
    margins: { top: 1020, right: 680, bottom: 1020, left: 680 },
    font: "Verdana",
    fontSize: 25, // half-points ×2 → 12.5pt, the document's body size
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  })) as ArrayBuffer;
  const bytes = Buffer.from(buf);

  const url = await putObject(
    storageKey.replace(/\.pdf$/, "") + ".docx",
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  await logAudit(ctx, {
    action: "UPDATE",
    entity: "Proposal",
    entityId: docId,
    after: { docx: url, docType },
  });
  return { url, bytes: bytes.byteLength };
}

export async function generatePdf(
  ctx: Ctx,
  docType: PdfDocType,
  docId: string,
): Promise<{ url: string; bytes: number }> {
  requireAdmin(ctx);
  const { printPath, storageKey, persist, runningHeader } = await resolve(ctx, docType, docId);

  const bytes = await renderDocPdf(
    { docType, docId, printPath, runningHeader },
    { userId: ctx.userId, role: ctx.role, companyId: ctx.companyId },
  );

  const url = await putObject(storageKey, bytes, "application/pdf");
  if (persist) await persist(url);

  const ENTITY: Record<PdfDocType, string> = {
    closeout: "Order",
    invoice: "Invoice",
    proposal: "Proposal",
    po: "PurchaseOrder",
    "payment-statement": "Order",
  };
  await logAudit(ctx, {
    action: "UPDATE",
    entity: ENTITY[docType],
    entityId: docId,
    after: { pdfUrl: url, bytes: bytes.length },
  });

  return { url, bytes: bytes.length };
}
