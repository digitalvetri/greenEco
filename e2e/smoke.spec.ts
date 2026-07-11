import { test, expect } from "@playwright/test";

/**
 * Smoke: every main page loads (HTTP 200) and renders its <h1> heading.
 * Default dev role is ADMIN, so the dashboard heading is "Dashboard".
 */
const PAGES: { path: string; heading: string | RegExp }[] = [
  { path: "/dashboard", heading: /Good (morning|afternoon|evening)/ }, // greeting header
  { path: "/leads", heading: "Leads" },
  { path: "/proposals", heading: "Proposals" },
  { path: "/projects", heading: "Projects" },
  { path: "/service", heading: "Service / AMC" },
  { path: "/materials", heading: "Materials" },
  { path: "/erection", heading: "Erection & Site Cost" },
  { path: "/reports", heading: "Reports" },
  { path: "/invoices", heading: "Invoices" },
  { path: "/settings", heading: "Settings" },
  { path: "/clients", heading: "Clients" },
];

for (const { path, heading } of PAGES) {
  test(`${path} returns 200 and renders its heading`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res!.status(), `${path} status`).toBe(200);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  });
}
