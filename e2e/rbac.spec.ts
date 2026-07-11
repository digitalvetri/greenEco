import { test, expect } from "@playwright/test";

/**
 * RBAC at the UI level — guards the server-side field/tile stripping.
 * Role is driven by the `dev_role` cookie read in src/lib/auth.ts.
 * Admin-only surfaces on the redesigned dashboard: the "Revenue Collected"
 * hero card and the "Top Clients" panel.
 */
const ADMIN_ONLY = ["Revenue Collected", "Top Clients"];

test("EMPLOYEE dashboard hides admin-only revenue surfaces", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "EMPLOYEE", url: "http://localhost:3000" }]);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  for (const label of ADMIN_ONLY) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  // Employee sees the admin-only notice instead of the revenue figure.
  await expect(page.getByText("Revenue is visible to admins only.")).toBeVisible();
});

test("ADMIN dashboard shows the admin-only revenue surfaces", async ({ context, page }) => {
  await context.addCookies([{ name: "dev_role", value: "ADMIN", url: "http://localhost:3000" }]);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  for (const label of ADMIN_ONLY) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});
