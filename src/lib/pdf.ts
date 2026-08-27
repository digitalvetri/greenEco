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

    // ── Table of contents: a measurement pass, only when the document has one ──
    //
    // Nothing knows how many pages §6's process descriptions will run to until the
    // document is actually laid out, so the page numbers cannot be written on the
    // first pass. Chromium can emit a document OUTLINE from the headings, and the
    // outline's destinations resolve to page indices — so one measurement render
    // answers every entry at once, rather than the ~15 renders a naive
    // hide-everything-after-section-N approach would need.
    //
    // The numbers written are the BODY's own page numbers, which is exactly what the
    // running footer prints — so a reader who looks up "10" and turns to the page
    // whose footer says "Page | 10" lands on the right one. (The client's own
    // contents page is off by one against its own footers, and lists a section on
    // p.22 of a 16-page document; theirs is not a usable reference here.)
    const tocCells = await page.locator("[data-toc-entry]").count();
    if (tocCells > 0) {
      const measured = await page.pdf({ ...withHeader, outline: true, tagged: true });
      const pages = await outlinePageNumbers(measured);
      if (pages.size > 0) {
        await page.evaluate((entries: [number, number][]) => {
          const byEntry = new Map(entries);
          document.querySelectorAll("[data-toc-entry]").forEach((cell) => {
            const n = Number(cell.getAttribute("data-toc-entry"));
            const pageNo = byEntry.get(n);
            // The cover is deliberately left blank: it carries no page number in
            // the printed document, so claiming one would send a reader nowhere.
            cell.textContent = pageNo ? String(pageNo) : "";
          });
        }, Array.from(pages.entries()));
      }
    }

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

/**
 * Page number of each numbered section, read from a tagged PDF's own outline.
 *
 * Chromium builds the outline from the document's headings, so the entry titles are
 * the section headings verbatim ("4. Introduction:"). The leading number IS the table
 * of contents row for §4 onwards; Greetings and Table of Contents are rows 2 and 3 and
 * are matched by title, and row 1 (the cover) is left unnumbered by design.
 *
 * Returns an empty map rather than throwing if the outline is missing or malformed —
 * a contents page without numbers is a cosmetic loss; a PDF that fails to generate is
 * not.
 */
async function outlinePageNumbers(pdf: Buffer): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  try {
    const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFHexString, PDFString } =
      await import("pdf-lib");
    const doc = await PDFDocument.load(pdf);
    const pageTags = doc.getPages().map((p) => p.ref.tag);
    const root = doc.catalog.lookup(PDFName.of("Outlines"));
    if (!(root instanceof PDFDict)) return out;

    const titleToEntry = (title: string): number | null => {
      const numbered = /^\s*(\d+)\./.exec(title);
      if (numbered) return Number(numbered[1]);
      if (/^greetings\b/i.test(title)) return 2;
      if (/^table of contents\b/i.test(title)) return 3;
      return null;
    };

    // Structural rather than `InstanceType<typeof PDFDict>`: pdf-lib's class has a
    // protected constructor, so the instance type can't be named from the value.
    type DictLike = { lookup(name: ReturnType<typeof PDFName.of>): unknown };
    const walk = (node: DictLike) => {
      let cur = node.lookup(PDFName.of("First"));
      while (cur instanceof PDFDict) {
        const rawTitle = cur.lookup(PDFName.of("Title"));
        const title =
          rawTitle instanceof PDFHexString || rawTitle instanceof PDFString
            ? rawTitle.decodeText()
            : "";
        const action = cur.lookup(PDFName.of("A"));
        const dest =
          cur.lookup(PDFName.of("Dest")) ??
          (action instanceof PDFDict ? action.lookup(PDFName.of("D")) : undefined);
        if (dest instanceof PDFArray) {
          const target = dest.get(0);
          if (target instanceof PDFRef) {
            const idx = pageTags.indexOf(target.tag);
            const entry = titleToEntry(title);
            // First occurrence wins: a section spanning pages starts on the earliest.
            if (idx >= 0 && entry != null && !out.has(entry)) out.set(entry, idx + 1);
          }
        }
        walk(cur);
        cur = cur.lookup(PDFName.of("Next"));
      }
    };
    walk(root);
  } catch {
    return new Map();
  }
  return out;
}

/**
 * The fully-rendered HTML of a print document, for the Word export.
 *
 * Deliberately the SAME page the PDF renderer loads, taken after hydration — so the
 * .docx is generated from the exact document that was reviewed as a PDF rather than
 * from a second, drifting template. The `.no-print` toolbar is stripped, and the
 * table of contents gets its page numbers filled the same way (Word repaginates, so
 * they are the PDF's numbers — the honest alternative would be no numbers at all).
 */
export async function renderDocHtml(
  doc: PdfDoc,
  requester: Pick<PrintClaims, "userId" | "role" | "companyId">,
): Promise<string> {
  const { chromium } = await import("playwright-core");
  const token = signPrintToken({ ...doc, ...requester });
  const url = `${env.appUrl.replace(/\/$/, "")}${doc.printPath}?t=${encodeURIComponent(token)}`;
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res || !res.ok()) throw new Error(`Print page returned ${res?.status() ?? "no response"}`);
    if ((await page.locator("[data-print-shell]").count()) === 0) {
      throw new Error(`Rendered page is not a print document for ${doc.printPath}`);
    }

    if ((await page.locator("[data-toc-entry]").count()) > 0) {
      await page.addStyleTag({ content: "[data-doc-cover] { display: none !important; }" });
      const measured = await page.pdf({
        format: "A4",
        printBackground: true,
        outline: true,
        tagged: true,
        margin: { top: "18mm", bottom: "18mm", left: "12mm", right: "12mm" },
      });
      const pages = await outlinePageNumbers(measured);
      await page.evaluate((entries: [number, number][]) => {
        const byEntry = new Map(entries);
        document.querySelectorAll("[data-doc-cover]").forEach((el) => {
          (el as HTMLElement).style.removeProperty("display");
        });
        document.querySelectorAll("[data-toc-entry]").forEach((cell) => {
          const n = Number(cell.getAttribute("data-toc-entry"));
          // `byEntry` is the serialized map — `pages` lives in Node and is NOT in
          // scope inside the page.
          const pageNo = byEntry.get(n);
          cell.textContent = pageNo ? String(pageNo) : "";
        });
      }, Array.from(pages.entries()));
      // The style tag hid the cover; drop it so the exported document keeps it.
      await page.evaluate(() => {
        document.querySelectorAll("style").forEach((st) => {
          if (st.textContent?.includes("[data-doc-cover]")) st.remove();
        });
      });
    }

    await page.evaluate(() => {
      document.querySelectorAll(".no-print").forEach((el) => el.remove());

      // The HTML→docx converter can only read PIXEL widths on table cells: a bare
      // number, a percentage or `auto` makes it emit an invalid XML attribute name
      // and throw, taking the whole export with it. Resolving each cell to its
      // COMPUTED width keeps the column proportions instead of stripping them.
      document.querySelectorAll("td, th").forEach((cell) => {
        const el = cell as HTMLElement;
        const w = getComputedStyle(el).width;
        if (w && w.endsWith("px")) el.style.width = w;
        else el.style.removeProperty("width");
      });
    });
    return await page.content();
  } finally {
    await browser.close();
  }
}
