import { z } from "zod";
import { api, jsonBody, rateLimit } from "@/lib/api";
import { generatePdf, generateDocx } from "@/server/services/pdf";

const bodySchema = z.object({
  docType: z.enum(["invoice", "proposal", "closeout", "po", "payment-statement"]),
  docId: z.string().min(1),
  /** "docx" produces the editable Word version of the same document. */
  format: z.enum(["pdf", "docx"]).default("pdf"),
});

/**
 * Generate + store a durable PDF for a document, return its URL.
 * Admin-only (enforced in the service); rate-limited (Chromium is expensive).
 *   POST /api/pdf  { docType: "invoice", docId: "GEC-INV-2026-001" }
 *   POST /api/pdf  { docType: "proposal", docId: "…", format: "docx" }
 */
export const POST = api(async (session, req) => {
  // 10 renders/min per user — generous for humans, caps a runaway loop.
  rateLimit(`pdf:${session.userId}`, 10, 60_000);
  const { docType, docId, format } = bodySchema.parse(await jsonBody(req));
  return format === "docx"
    ? generateDocx(session, docType, docId)
    : generatePdf(session, docType, docId);
});
