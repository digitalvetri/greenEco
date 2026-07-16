import { test, expect } from "@playwright/test";

/** Unique valid Indian mobile: 10 digits, starts 6-9. */
function uniquePhone(): string {
  return "9" + String(Date.now()).slice(-9);
}

test("create a lead via /leads/new then add a follow-up on its detail page", async ({ page }) => {
  const phone = uniquePhone();
  const customerName = `E2E Lead ${phone}`;

  // (a) Create the lead.
  await page.goto("/leads/new");
  await expect(page.getByRole("heading", { name: "New Lead", exact: true })).toBeVisible();

  // The flow opens on a New/Existing customer picker; the form only mounts after choosing.
  await page.getByRole("button", { name: "Add New Customer" }).click();

  // getByLabel proves the Field a11y association on the core lead fields.
  await page.getByLabel("Customer Name").fill(customerName);
  // Two address fields exist now (customer Address + the newer Project Address) — exact match
  // to disambiguate ("Project Address" contains "Address" as a substring).
  await page.getByLabel("Address", { exact: true }).fill("12 Test Road, Chennai");
  await page.getByLabel("Phone (10 digits)").fill(phone);
  // Source defaults to a valid value ("Reference"); leave as-is.

  await page.getByRole("button", { name: "Save Lead" }).click();

  // Lands on the detail page: heading is the customer name, URL is /leads/<id>.
  await expect(page).toHaveURL(/\/leads\/[^/]+$/);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();

  // (b) Add a follow-up via the detail-page form.
  const noteText = `E2E follow-up note ${Date.now()}`;
  // Future next-date (YYYY-MM-DD), 7 days out.
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  await expect(page.getByText("Add Follow-up")).toBeVisible();
  // The only <textarea> on the detail page is the follow-up Notes field.
  await page.locator("textarea").fill(noteText);
  await page.locator('input[type="date"]').fill(future);

  await page.getByRole("button", { name: "Save Follow-up" }).click();

  // The note appears in the (now unified) activity timeline after router.refresh().
  await expect(page.getByText(noteText)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Activity \(/ })).toBeVisible();
});

test("documents: attach a file to a lead and see it listed", async ({ page, request }) => {
  const phone = uniquePhone();
  const created = await request.post("/api/leads", {
    data: { customerName: `E2E Docs ${phone}`, address: "12 Test Rd, Chennai", phone, source: "CallIn" },
  });
  const { lead } = await created.json();

  await page.goto(`/leads/${lead.id}`, { waitUntil: "networkidle" });
  // A 1x1 PNG uploaded through the Documents card's Uploader.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('input[type="file"]').last().setInputFiles({ name: "site-report.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("site-report.png")).toBeVisible();
});

test("comms: log a call and send a (gated) WhatsApp, both land in the timeline", async ({ page, request }) => {
  const phone = uniquePhone();
  const created = await request.post("/api/leads", {
    data: { customerName: `E2E Comms ${phone}`, address: "12 Test Rd, Chennai", phone, source: "CallIn" },
  });
  const { lead } = await created.json();

  await page.goto(`/leads/${lead.id}`, { waitUntil: "networkidle" });

  // Log a call — getByLabel (scoped to the dialog) proves the Field a11y association.
  await page.getByRole("button", { name: "Log call" }).click();
  await page.getByRole("dialog").getByLabel("Notes").fill("Discussed a 50 KLD STP");
  await page.getByRole("dialog").getByRole("button", { name: "Log call" }).click();
  await expect(page.getByText("Discussed a 50 KLD STP")).toBeVisible();

  // Send a WhatsApp — no provider configured, so it's recorded as logged-not-sent.
  await page.getByRole("button", { name: "WhatsApp" }).click();
  await page.getByRole("dialog").getByLabel("Message").fill("Sharing our proposal shortly");
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sharing our proposal shortly")).toBeVisible();
  await expect(page.getByText("Logged (not sent)").first()).toBeVisible();
});

test("domain: a sized lead shows plant sizing, a temperature, and a pre-quote value (P2)", async ({ page, request }) => {
  const phone = uniquePhone();
  const created = await request.post("/api/leads", {
    data: {
      customerName: `E2E Sized ${phone}`,
      address: "SIDCO, Coimbatore",
      phone,
      source: "Consultant",
      plantType: "ETP",
      technology: "SBR",
      capacityKLD: 120,
      segment: "Textile",
      budgetBand: "Above ₹1Cr",
      decisionTimeline: "Immediate (<1 mo)",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { lead } = await created.json();

  await page.goto(`/leads/${lead.id}`, { waitUntil: "networkidle" });
  // Structured sizing surfaced (not buried in free text).
  await expect(page.getByText("Plant sizing", { exact: true })).toBeVisible();
  await expect(page.getByText("120 KLD")).toBeVisible();
  // Temperature badge (this profile is HOT).
  await expect(page.getByText(/Hot ·/)).toBeVisible();
  // Pre-quote indicative value — the killer feature.
  await expect(page.getByText("Indicative value (pre-quote)")).toBeVisible();
});

test("lifecycle: mark a lead lost (with reason) then reopen it (P1-1)", async ({ page, request }) => {
  const phone = uniquePhone();
  const created = await request.post("/api/leads", {
    data: { customerName: `E2E Lifecycle ${phone}`, address: "addr", phone, source: "CallIn" },
  });
  const { lead } = await created.json();

  await page.goto(`/leads/${lead.id}`);
  // Mark lost via the dialog — reason is now a structured picklist (P2-5).
  await page.getByRole("button", { name: "Mark lost" }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("Lost to competitor");
  await page.getByRole("dialog").getByRole("button", { name: "Mark lost" }).click();
  await expect(page.getByText("LOST", { exact: true }).first()).toBeVisible();

  // A closed lead offers Reopen (which a follow-up close cannot do).
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("IN FOLLOWUP", { exact: true }).first()).toBeVisible();

  // The activity timeline records the status changes.
  await expect(page.getByRole("heading", { name: /Activity \(/ })).toBeVisible();
  await expect(page.getByText(/Status →/).first()).toBeVisible();
});

test("edit a lead's core fields (P0-3 — leads were previously immutable)", async ({ page, request }) => {
  const phone = uniquePhone();
  // Create via API for speed, then edit through the UI.
  const created = await request.post("/api/leads", {
    data: { customerName: `E2E Edit ${phone}`, address: "old address", phone, source: "Reference" },
  });
  expect(created.ok()).toBeTruthy();
  const { lead } = await created.json();

  await page.goto(`/leads/${lead.id}/edit`);
  await expect(page.getByRole("heading", { name: "Edit Lead", exact: true })).toBeVisible();

  const fixedName = `E2E Edit ${phone} (fixed)`;
  // Target the Customer Name field by placeholder (getByRole textbox .first()
  // would grab the global header search box, which is first in the DOM).
  await page.getByPlaceholder("e.g. Green Meadows Apartments Assn.").fill(fixedName);
  await page.getByRole("button", { name: "Save changes" }).click();

  // Lands back on the detail page showing the edited name.
  await expect(page).toHaveURL(new RegExp(`/leads/${lead.id}$`));
  await expect(page.getByRole("heading", { name: fixedName, exact: true })).toBeVisible();
});
