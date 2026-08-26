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
    // ── Documents with a running letterhead are rendered in TWO passes ────────
    //
    // The client's own proposals carry the letterhead and the page numbering from
    // the page AFTER the cover: their cover is clean and unnumbered, and the page
    // following it is "Page | 1". Chromium paints `displayHeaderFooter` into every
    // page's top margin box with no per-page switch, and its page counter always
    // starts at the first physical page — so a single render can satisfy neither.
    //
    // So: render the cover alone with no header/footer, render the body alone WITH
    // them (its own page 1 is therefore the first numbered page, exactly as theirs),
    // and concatenate. Both passes reuse the same loaded page, so this costs one
    // extra pdf() call rather than a second browser launch or navigation.
    if (!doc.runningHeader) {
      return await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      });
    }

    const hasCover = (await page.locator("[data-doc-cover]").count()) > 0;
    const header = `<div style="width:100%;font-size:8px;color:#0f7a4d;text-align:right;padding:0 14mm;font-family:sans-serif;">${escapeHtml(doc.runningHeader)}</div>`;
    const footer = `<div style="width:100%;font-size:8px;color:#888;text-align:right;padding:0 14mm;font-family:sans-serif;">Page | <span class="pageNumber"></span></div>`;
    const withHeader = {
      format: "A4" as const,
      printBackground: true,
      displayHeaderFooter: true,
      // Chromium renders these in an isolated context with a default 10px font and
      // NO page CSS, so every style has to be inline here.
      headerTemplate: header,
      footerTemplate: footer,
      // Extra top/bottom room so the running header/footer don't overlap content.
      margin: { top: "18mm", bottom: "18mm", left: "12mm", right: "12mm" },
    };

    if (!hasCover) return await page.pdf(withHeader);

    // Pass 1 — the cover on its own, clean.
    await page.addStyleTag({ content: "[data-doc-cover] ~ * { display: none !important; }" });
    const coverPdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });

    // Pass 2 — everything except the cover, letterhead on, numbered from 1.
    await page.addStyleTag({
      content:
        "[data-doc-cover] ~ * { display: revert !important; } [data-doc-cover] { display: none !important; }",
    });
    const bodyPdf = await page.pdf(withHeader);

    return await concatPdfs([coverPdf, bodyPdf]);
  } finally {
    await browser.close();
  }
}

/** Chromium's header/footer templates are raw HTML — never interpolate unescaped. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Concatenate rendered PDFs into one. Used only to join the cover pass to the body
 * pass — see the two-pass comment above. `pdf-lib` is pure JS with no native
 * dependencies, so it doesn't complicate the container image.
 */
async function concatPdfs(parts: Buffer[]): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const pg of pages) out.addPage(pg);
  }
  return Buffer.from(await out.save());
}
