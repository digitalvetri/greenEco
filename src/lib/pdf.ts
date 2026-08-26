import { env } from "./env";
import { signPrintToken, type PrintClaims } from "./print-token";

/**
 * Server-side PDF rendering (Phase 1). Drives a headless Chromium to the
 * branded /print/* route and captures it as a PDF — one source of truth for
 * on-screen and printed layout, no second templating system to drift.
 *
 * The /print/* page has no session cookie in this context, so we mint a
 * short-lived print token bound to (docType, docId, requester) and pass it as
 * ?t=. See lib/print-token + lib/print-session.
 *
 * Deployment note: this needs the Chromium binary in the runtime image.
 * In the Docker image:  RUN npx playwright install --with-deps chromium
 */

export interface PdfDoc {
  docType: PrintClaims["docType"];
  docId: string;
  /** App-relative print path, e.g. /print/invoice/GEC-INV-0001 */
  printPath: string;
  /**
   * Running header/footer for multi-page documents. The client's Project Report and
   * BOQ carry "Green Ecocare Private Limited" at the top of every page and "Page | N"
   * at the bottom; Chromium can only draw those via printToPDF's own templates, so
   * they cannot live in the page's HTML.
   *
   * Opt-in per document: the invoice/PO/closeout PDFs are single-page and were
   * verified without them, so they must stay unaffected.
   *
   * ⚠️ These appear in the GENERATED pdf only, never in the browser's own Print
   * preview of /print/* — that path has no way to set them.
   */
  runningHeader?: string;
}

export async function renderDocPdf(
  doc: PdfDoc,
  requester: Pick<PrintClaims, "userId" | "role" | "companyId">,
): Promise<Buffer> {
  // playwright-core is a runtime dep; import lazily so non-PDF paths never load it.
  const { chromium } = await import("playwright-core");

  const token = signPrintToken({ ...doc, ...requester });
  const url = `${env.appUrl.replace(/\/$/, "")}${doc.printPath}?t=${encodeURIComponent(token)}`;

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"], // container-friendly
  });
  try {
    const page = await browser.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res || !res.ok()) {
      throw new Error(`Print page returned ${res?.status() ?? "no response"} for ${doc.printPath}`);
    }
    // Guard against rendering a redirect/error page: the print shell tags itself.
    const isPrintPage = await page.locator("[data-print-shell]").count();
    if (isPrintPage === 0) {
      throw new Error(`Rendered page is not a print document (auth or route error) for ${doc.printPath}`);
    }
    const pdf = doc.runningHeader
      ? await page.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: true,
          // Chromium renders these in an isolated context with a default 10px font and
          // NO page CSS, so every style has to be inline here.
          headerTemplate: `<div style="width:100%;font-size:8px;color:#0f7a4d;text-align:right;padding:0 14mm;font-family:sans-serif;">${escapeHtml(doc.runningHeader)}</div>`,
          footerTemplate: `<div style="width:100%;font-size:8px;color:#888;text-align:right;padding:0 14mm;font-family:sans-serif;">Page | <span class="pageNumber"></span></div>`,
          // Extra top/bottom room so the running header/footer don't overlap content.
          //
          // ⚠️ The running header prints on the COVER page too, which the client's own
          // documents don't do — their letterhead and page numbering both start on the
          // page after it. Chromium paints `displayHeaderFooter` into every page's top
          // margin box and offers no per-page switch; a named `@page cover { margin-top:
          // 0 }` was tried and does NOT suppress it. Matching this exactly needs the
          // cover rendered separately and the two PDFs concatenated (a pdf-lib
          // dependency), which is not worth it for one line of letterhead.
          margin: { top: "18mm", bottom: "18mm", left: "12mm", right: "12mm" },
        })
      : await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
        });
    return pdf;
  } finally {
    await browser.close();
  }
}

/** Chromium's header/footer templates are raw HTML — never interpolate unescaped. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
