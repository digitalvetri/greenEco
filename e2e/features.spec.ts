import { test, expect } from "@playwright/test";

/**
 * Feature-screen coverage beyond smoke: proposal editor, materials tools,
 * service/AMC detail, invoicing affordances — the screens users actually work
 * in day-to-day. IDs are discovered at runtime from the list pages (no hardcoded
 * ids), so these pass against any seeded+verified DB, not just one machine.
 */

/** First `/<section>/<id>` detail link on a list page, or "" if none exist. */
async function firstDetailId(request: import("@playwright/test").APIRequestContext, section: string): Promise<string> {
  const html = await (await request.get(`/${section}`, { headers: { cookie: "dev_role=ADMIN" } })).text();
  const m = html.match(new RegExp(`/${section}/([a-z0-9]{20,})`));
  return m ? m[1] : "";
}

test("proposal editor renders the proposal with its actions", async ({ page, request }) => {
  const id = await firstDetailId(request, "proposals");
  test.skip(!id, "no proposals in DB — run scripts/verify-sell.ts");
  const res = await page.goto(`/proposals/${id}`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  // The branded print link is the stable, always-present affordance.
  await expect(page.getByRole("link", { name: /print|pdf/i }).first()).toBeVisible();
});

test("materials tools expose the field actions", async ({ page }) => {
  await page.goto("/materials", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Transfer", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Issue to Site", { exact: false }).first()).toBeVisible();
});

test("materials list has KPI tiles, category tabs, search, export (Materials P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/materials", { waitUntil: "networkidle" });
  await expect(page.getByText("Low stock")).toBeVisible();
  await expect(page.getByText("Stock value")).toBeVisible();
  await expect(page.getByLabel("Search items")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export POs" })).toBeVisible(); // P2 PO export
  // Category tab filters (unique "All" pill in the tab row).
  await expect(page.getByRole("link", { name: "All", exact: true })).toBeVisible();
});

test("credentials login: sign-in page works and admin lands on the dashboard", async ({ browser }) => {
  // Fresh context (no dev_role cookie) — the real session cookie takes precedence.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@greeneco.in");
  await page.getByLabel("Password").fill("Admin@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
  await expect(page.getByText("Revenue Collected")).toBeVisible(); // admin role from credentials
  await ctx.close();
});

test("credentials login: wrong password is rejected with a generic error", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("admin@greeneco.in");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await ctx.close();
});

test("reports has collection tiles + GST-filing summary (Reports P1)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/reports", { waitUntil: "networkidle" });
  await expect(page.getByText("GST summary (for GSTR filing)")).toBeVisible();
  await expect(page.getByText("Collected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export GST" })).toBeVisible();
});

test("clients analytics shows deduped customers + top-by-revenue (Clients P1)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/clients/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Unique customers")).toBeVisible();
  await expect(page.getByText("Top clients by revenue")).toBeVisible();
});

test("dashboard shows cross-module ops KPIs (Dashboard P1)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("Receivables", { exact: true })).toBeVisible();
  await expect(page.getByText("AMC run-rate")).toBeVisible();
});

test("clients list has KPI tiles + search + paginated list (Clients P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/clients", { waitUntil: "networkidle" });
  await expect(page.getByText("Lifetime value")).toBeVisible();
  await expect(page.getByText("Active projects")).toBeVisible();
  await expect(page.getByLabel("Search clients")).toBeVisible();
  await expect(page.locator('a[href^="/clients/"]').first()).toBeVisible();
});

test("invoices list has KPI tiles + search; EMPLOYEE gated (Invoices P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/invoices", { waitUntil: "networkidle" });
  await expect(page.getByText("Outstanding")).toBeVisible();
  await expect(page.getByText("Credit notes")).toBeVisible();
  await expect(page.getByLabel("Search invoices")).toBeVisible();

  await context.clearCookies();
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/invoices", { waitUntil: "networkidle" });
  await expect(page.getByText("admins only")).toBeVisible(); // module is admin-only
  await expect(page.getByText("Outstanding")).toHaveCount(0);
});

test("erection list has KPI tiles, status/type tabs, search (Erection P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/erection", { waitUntil: "networkidle" });
  await expect(page.getByText("Pending review")).toBeVisible();
  await expect(page.getByText("Approved spend")).toBeVisible();
  await expect(page.getByLabel("Search entries")).toBeVisible();
  await expect(page.getByRole("link", { name: "Queried", exact: true })).toBeVisible(); // status tab
  await expect(page.getByRole("link", { name: "Site purchase" })).toBeVisible(); // type tab
  await expect(page.getByRole("button", { name: "Export BvA" })).toBeVisible(); // P2 export
});

test("erection analytics renders spend/approval/budget-burn (Erection P1-4)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/erection/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Erection Analytics" })).toBeVisible();
  await expect(page.getByText("Spend by type")).toBeVisible();
  await expect(page.getByText(/Budget burn/)).toBeVisible();
});

test("EMPLOYEE cannot reach erection analytics (Erection P1-4 RBAC)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/erection/analytics", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Erection Analytics" })).toHaveCount(0); // 404, admin-only
});

test("erection per-project detail shows BvA + entries + approval timeline (Erection P1)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "erection");
  test.skip(!id, "no erection projects in DB");
  await page.goto(`/erection/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Approval activity")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget vs Actual" })).toBeVisible();
  await expect(page.getByText(/Entries \(/)).toBeVisible();
});

test("EMPLOYEE cannot reach the per-project erection detail (Erection P1 RBAC)", async ({ context, page, request }) => {
  const id = await firstDetailId(request, "erection"); // discovered as admin
  test.skip(!id, "no erection projects in DB");
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto(`/erection/${id}`, { waitUntil: "networkidle" });
  // Admin-only cross-author cost view → 404 for employees; the BvA card must not render.
  await expect(page.getByRole("heading", { name: "Budget vs Actual" })).toHaveCount(0);
  await expect(page.getByText("Approval activity")).toHaveCount(0);
});

test("EMPLOYEE erection hides approved spend, overruns, verification, budget (Erection P0 RBAC)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/erection", { waitUntil: "networkidle" });
  await expect(page.getByText("Pending review")).toBeVisible(); // own count renders
  await expect(page.getByText("Approved spend")).toHaveCount(0);
  await expect(page.getByText("Overrun projects")).toHaveCount(0);
  await expect(page.getByText("Verification Queue")).toHaveCount(0);
  await expect(page.getByText("Budget vs Actual")).toHaveCount(0);
});

test("materials analytics renders valuation + PO aging + vendor spend (Materials P1-4)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/materials/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Materials Analytics" })).toBeVisible();
  await expect(page.getByText("Stock value by category")).toBeVisible();
  await expect(page.getByText("Open PO aging")).toBeVisible();
});

test("EMPLOYEE materials analytics hides every ₹ surface (Materials P1-4 RBAC)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/materials/analytics", { waitUntil: "networkidle" });
  await expect(page.getByText("Open PO aging")).toBeVisible(); // page renders
  await expect(page.getByText("Stock value by category")).toHaveCount(0); // admin-only card
  await expect(page.getByText("Top vendor spend")).toHaveCount(0);
});

test("material item detail surfaces the stock-movement ledger (Materials P1)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "materials");
  test.skip(!id, "no items in DB");
  await page.goto(`/materials/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Stock movement ledger")).toBeVisible();
  await expect(page.getByText("On hand by location")).toBeVisible();
  await expect(page.getByText("Value ₹")).toBeVisible(); // admin sees the money column
});

test("EMPLOYEE item detail hides ledger value + vendor prices (Materials P1 RBAC)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "materials");
  test.skip(!id, "no items in DB");
  await page.goto(`/materials/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByText("On hand by location")).toBeVisible(); // ledger + balances still render
  await expect(page.getByText("Value ₹")).toHaveCount(0); // no money column
  await expect(page.getByText("Vendor prices")).toHaveCount(0);
});

test("EMPLOYEE materials hides stock value, purchase prices, and admin tools (Materials P0 RBAC)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/materials", { waitUntil: "networkidle" });
  await expect(page.getByText("Low stock")).toBeVisible(); // list + tiles render
  await expect(page.getByText("Stock value")).toHaveCount(0);
  await expect(page.getByText("Purch. ₹")).toHaveCount(0); // no price column
  await expect(page.getByText("Raise Purchase Order")).toHaveCount(0); // no admin tools
});

test("service/AMC detail page renders for a contract", async ({ page, request }) => {
  const id = await firstDetailId(request, "service");
  test.skip(!id, "no service contracts in DB — run scripts/verify-amc.ts");
  const res = await page.goto(`/service/${id}`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("EMPLOYEE does not see AMC annual revenue; ADMIN does", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/service", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("AMC Annual Revenue")).toHaveCount(0);

  await context.clearCookies();
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/service", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("AMC Annual Revenue")).toBeVisible();
});

test("invoices page offers a PDF download affordance to admin", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/invoices", { waitUntil: "domcontentloaded" });
  // The DownloadPdfButton renders an aria-labelled control per invoice row.
  await expect(page.getByRole("button", { name: /PDF/i }).first()).toBeVisible();
});

test("leads: KPI tiles render and the search filter changes the result set", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/leads", { waitUntil: "networkidle" });

  // KPI header tiles (P1-5) — use uniquely-worded labels (tabs reuse "Converted"/"Going Cold").
  await expect(page.getByText("Follow-ups due today")).toBeVisible();
  await expect(page.getByText("Converted this month")).toBeVisible();

  const rowCount = () => page.locator('a[href^="/leads/"]').count();
  const before = await rowCount();
  expect(before).toBeGreaterThan(0);

  // Search narrows the set (assert the count actually drops, not just that the box renders).
  await page.getByLabel("Search leads").fill("Price");
  await page.waitForURL(/search=Price/);
  await page.waitForLoadState("networkidle");
  const after = await rowCount();
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(0);
});

test("leads analytics renders the pipeline funnel + win rate (P2 analytics)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/leads/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Lead Analytics" })).toBeVisible();
  await expect(page.getByText("Win rate")).toBeVisible();
  await expect(page.getByText("Pipeline funnel")).toBeVisible();
  await expect(page.getByText("Open pipeline (indicative)")).toBeVisible();
});

test("leads: owner filter + My-leads toggle are admin-only", async ({ context, page }) => {
  // Admin sees the owner controls.
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/leads", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Filter by owner")).toBeVisible();
  await expect(page.getByRole("button", { name: "My leads" })).toBeVisible();

  // Employee does not.
  await context.clearCookies();
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/leads", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Filter by owner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "My leads" })).toHaveCount(0);
});

test("proposals list has KPI tiles, an expiry tab, and a working search (P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/proposals", { waitUntil: "networkidle" });
  await expect(page.getByText("In play")).toBeVisible();
  await expect(page.getByText("Open pipeline")).toBeVisible();
  await expect(page.getByRole("link", { name: "Negotiating" })).toBeVisible();

  const rows = () => page.locator('a[href^="/proposals/"]').count();
  const before = await rows();
  expect(before).toBeGreaterThan(0);
  await page.getByLabel("Search proposals").fill("P3");
  await page.waitForURL(/search=P3/);
  await page.waitForLoadState("networkidle");
  expect(await rows()).toBeLessThan(before);
});

test("proposal editor has an Activity tab with version history (P1-1)", async ({ page, request }) => {
  const id = await firstDetailId(request, "proposals");
  test.skip(!id, "no proposals in DB");
  await page.goto(`/proposals/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Activity/ }).click();
  // Every proposal's timeline has at least its creation event.
  await expect(page.getByText("Proposal created")).toBeVisible();
});

test("proposal analytics renders win rate + AI-vs-manual (P1-4)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/proposals/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Proposal Analytics" })).toBeVisible();
  await expect(page.getByText("Win rate by value")).toBeVisible();
  await expect(page.getByText("Avg deal size")).toBeVisible();
});

test("proposal editor has Documents + Send-to-client (P2)", async ({ page, request }) => {
  const id = await firstDetailId(request, "proposals");
  test.skip(!id, "no proposals in DB");
  await page.goto(`/proposals/${id}`, { waitUntil: "networkidle" });
  // Documents tab exists on every proposal.
  await expect(page.getByRole("tab", { name: /Documents/ })).toBeVisible();
  await page.getByRole("tab", { name: /Documents/ }).click();
  await expect(page.getByText(/signed proposal|No documents/i)).toBeVisible();
});

test("projects list has KPI tiles, status tabs, and a working search (P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/projects", { waitUntil: "networkidle" });
  await expect(page.getByText("Receivables")).toBeVisible();
  await expect(page.getByText("Payments overdue")).toBeVisible();
  // "Cancelled" is a unique tab (no KPI tile of that name).
  await expect(page.getByRole("link", { name: "Cancelled" })).toBeVisible();

  const rows = () => page.locator('a[href^="/projects/"]').count();
  const before = await rows();
  expect(before).toBeGreaterThan(0);
  await page.getByLabel("Search projects").fill("Verify");
  await page.waitForURL(/search=Verify/);
  await page.waitForLoadState("networkidle");
  expect(await rows()).toBeLessThanOrEqual(before);
});

test("project detail is tabbed with an execution activity timeline (P1)", async ({ page, request }) => {
  const id = await firstDetailId(request, "projects");
  test.skip(!id, "no projects in DB");
  await page.goto(`/projects/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByText("Project created")).toBeVisible();
});

test("project detail exposes client comms, milestone scheduling, and archive (P2)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "projects");
  test.skip(!id, "no projects in DB");
  await page.goto(`/projects/${id}`, { waitUntil: "networkidle" });
  // Admin lifecycle controls incl. archive.
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  // Client communication panel on the Activity tab.
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByText("Client communication")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
  await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
  // Milestone schedule editor on the Payments tab.
  await page.getByRole("tab", { name: /Payments/ }).click();
  const sched = page.getByRole("button", { name: "Schedule" }).first();
  await expect(sched).toBeVisible();
  await sched.click();
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeVisible();
});

test("EMPLOYEE project detail renders, comms work, admin controls + pricing hidden (P2 RBAC)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  // The list is team-scoped for EMPLOYEE — grab a project THIS employee can access.
  const html = await (await request.get("/projects", { headers: { cookie: "dev_role=EMPLOYEE" } })).text();
  const id = html.match(/\/projects\/([a-z0-9]{20,})/)?.[1] ?? "";
  test.skip(!id, "no employee-scoped project in DB");
  await page.goto(`/projects/${id}`, { waitUntil: "networkidle" });
  // Renders without crashing; comm panel is available to the team-scoped employee.
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
  // Admin-only controls absent.
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hold" })).toHaveCount(0);
  // Admin-only pricing stripped (Budget / Gross Margin never in the DOM for EMPLOYEE).
  await expect(page.getByText("Gross Margin")).toHaveCount(0);
});

test("project analytics renders execution + receivables (P1-4)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/projects/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Project Analytics" })).toBeVisible();
  await expect(page.getByText("Value in execution")).toBeVisible();
  await expect(page.getByText("On-time stages")).toBeVisible();
});

test("service list has KPI tiles, status tabs, search, and paginated tickets (Service P0)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/service", { waitUntil: "networkidle" });
  await expect(page.getByText("Active Contracts")).toBeVisible();
  await expect(page.getByText("AMC Annual Revenue")).toBeVisible();
  // Status tabs — "Cancelled" is unique to the tab row (no KPI tile of that name).
  await expect(page.getByRole("link", { name: "Cancelled" })).toBeVisible();
  await expect(page.getByLabel("Search contracts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible(); // P2 Excel export
  // Filter to EXPIRED via the tab and stay on a 200.
  await page.getByRole("link", { name: "Expired" }).click();
  await page.waitForURL(/status=EXPIRED/);
  await expect(page.getByRole("heading", { name: "Service / AMC" })).toBeVisible();
});

test("service contract detail has a live status badge + admin cancel control (Service P0)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "service");
  test.skip(!id, "no contracts in DB");
  await page.goto(`/service/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Cancel contract" })).toBeVisible();
  // The PM schedule now lives behind the Schedule tab (detail is tab-split in P1).
  await page.getByRole("tab", { name: /Schedule/ }).click();
  await expect(page.getByText("Preventive-Maintenance Schedule")).toBeVisible();
});

test("service analytics renders run-rate + compliance + SLA (Service P1-4)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const res = await page.goto("/service/analytics", { waitUntil: "networkidle" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Service / AMC Analytics" })).toBeVisible();
  await expect(page.getByText("Recurring revenue")).toBeVisible();
  await expect(page.getByText("Visit compliance")).toBeVisible();
  await expect(page.getByText("SLA breach")).toBeVisible();
  await expect(page.getByText("Renewal rate")).toBeVisible(); // P2
});

test("service contract detail is tab-split with a merged activity timeline + comms (Service P1)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "service");
  test.skip(!id, "no contracts in DB");
  await page.goto(`/service/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Schedule/ })).toBeVisible();
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByText("Client communication")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
  await expect(page.getByText("Contract created")).toBeVisible();
});

test("EMPLOYEE service list strips AMC revenue + per-contract value (Service P0 RBAC)", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/service", { waitUntil: "networkidle" });
  await expect(page.getByText("Active Contracts")).toBeVisible();
  // Admin-only money is absent for EMPLOYEE.
  await expect(page.getByText("AMC Annual Revenue")).toHaveCount(0);
  await expect(page.getByText("/yr")).toHaveCount(0);
});

test("EMPLOYEE contract detail renders, comms work, admin controls + value hidden (Service P1 RBAC)", async ({ context, page, request }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  const id = await firstDetailId(request, "service");
  test.skip(!id, "no contracts in DB");
  await page.goto(`/service/${id}`, { waitUntil: "networkidle" });
  // Renders + comm panel available to the employee.
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
  // Admin-only controls + admin-only money stripped.
  await expect(page.getByRole("button", { name: "Cancel contract" })).toHaveCount(0);
  await expect(page.getByText("Bill AMC period")).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Annual value")).toHaveCount(0);
});
