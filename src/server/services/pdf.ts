import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { renderDocPdf } from "@/lib/pdf";
import { putObject } from "@/lib/storage";

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

export type PdfDocType = "invoice" | "proposal" | "closeout";

interface Resolved {
  printPath: string;
  storageKey: string;
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
        select: { id: true, currentVersion: true },
      });
      if (!p) throw new Error("Proposal not found");
      return {
        printPath: `/print/proposal/${docId}`,
        storageKey: randomKey("proposal", `${docId}-v${p.currentVersion}`),
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
  }
}

export async function generatePdf(
  ctx: Ctx,
  docType: PdfDocType,
  docId: string,
): Promise<{ url: string; bytes: number }> {
  requireAdmin(ctx);
  const { printPath, storageKey, persist } = await resolve(ctx, docType, docId);

  const bytes = await renderDocPdf(
    { docType, docId, printPath },
    { userId: ctx.userId, role: ctx.role, companyId: ctx.companyId },
  );

  const url = await putObject(storageKey, bytes, "application/pdf");
  if (persist) await persist(url);

  await logAudit(ctx, {
    action: "UPDATE",
    entity: docType === "closeout" ? "Order" : docType === "invoice" ? "Invoice" : "Proposal",
    entityId: docId,
    after: { pdfUrl: url, bytes: bytes.length },
  });

  return { url, bytes: bytes.length };
}
