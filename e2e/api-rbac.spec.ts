import { test, expect } from "@playwright/test";

/**
 * API-level RBAC + security boundaries — the spec's non-negotiables, tested at
 * the wire, not just the UI. If any of these regress, pricing data leaks to
 * EMPLOYEE or an unauth'd caller renders a priced document.
 */

/** Mirror of ADMIN_ONLY_KEYS in src/lib/rbac.ts — must never appear in EMPLOYEE JSON. */
const FORBIDDEN_KEYS = [
  "purchasePrice",
  "estimatedCost",
  "valueAtCost",
  "totalValue",
  "baseAmount",
  "adjustments",
  "annualValue",
  "amcAnnualRevenue",
  "margin",
  "grossMargin",
  "marginPct",
  "minMarginPct",
  "committed",
  "budget",
  "purchaseRate",
  "vendorPrices",
];

/** Recursively collect every object key present in a JSON value. */
function allKeys(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const item of v) allKeys(item, acc);
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      acc.add(k);
      allKeys(val, acc);
    }
  }
  return acc;
}

const asEmployee = { headers: { cookie: "dev_role=EMPLOYEE" } };
const asAdmin = { headers: { cookie: "dev_role=ADMIN" } };

/** Discover a real invoice number from the admin invoices page (no hardcoded ids). */
async function firstInvoiceNo(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const html = await (await request.get("/invoices", asAdmin)).text();
  const m = html.match(/GEC-INV-\d{4}-\d{3,}/);
  if (!m) throw new Error("No invoice found — CI must run scripts/verify-execute.ts to seed one");
  return m[0];
}

test("EMPLOYEE search returns real rows, none carrying admin-only pricing keys", async ({ request }) => {
  // "Chennai" matches seeded lead addresses — a non-empty result set so the
  // stripping is provably exercised (an empty set would pass vacuously).
  const res = await request.get("/api/search?q=Chennai", asEmployee);
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.hits.length, "search must return rows for this assertion to mean anything").toBeGreaterThan(0);
  const keys = allKeys(body);
  const leaked = FORBIDDEN_KEYS.filter((k) => keys.has(k));
  expect(leaked, `EMPLOYEE search leaked pricing keys: ${leaked.join(", ")}`).toEqual([]);
});

test("EMPLOYEE cannot generate a document PDF (403)", async ({ request }) => {
  const invoiceNo = await firstInvoiceNo(request);
  const res = await request.post("/api/pdf", {
    ...asEmployee,
    data: { docType: "invoice", docId: invoiceNo },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toMatch(/admin/i);
});

test("ADMIN can generate a document PDF and gets a durable URL", async ({ request }) => {
  const invoiceNo = await firstInvoiceNo(request);
  const res = await request.post("/api/pdf", {
    ...asAdmin,
    data: { docType: "invoice", docId: invoiceNo },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.url).toMatch(/\.pdf$/);
  expect(body.bytes).toBeGreaterThan(1000);
});

test("a forged print token does not render the document (404, no leak)", async ({ request }) => {
  const invoiceNo = await firstInvoiceNo(request);
  const res = await request.get(`/print/invoice/${invoiceNo}?t=v1.ZmFrZQ.ZmFrZQ`);
  expect(res.status()).toBe(404);
  const html = await res.text();
  // The invoice's client name / totals must not appear in the 404 body.
  expect(html).not.toContain("TAX INVOICE");
});

test("stored PDFs are not enumerable by sequential document number", async ({ request }) => {
  // The public PDF URL is auth-free by design (customers have no login), so the
  // KEY must be unguessable. A sequential-number path must NOT resolve to a file.
  const invoiceNo = await firstInvoiceNo(request);
  for (const guess of [
    `/pdfs/invoice/${invoiceNo}.pdf`,
    "/pdfs/invoice/GEC-INV-2026-001.pdf",
    "/pdfs/closeout/GEC-ORD-2026-001.pdf",
  ]) {
    const res = await request.get(guess);
    expect(res.status(), `guessable PDF path leaked: ${guess}`).toBe(404);
  }
});

test("healthz reports db ok", async ({ request }) => {
  const res = await request.get("/api/healthz");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks.db).toBe("ok");
});
