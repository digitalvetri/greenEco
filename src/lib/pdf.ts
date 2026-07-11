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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
