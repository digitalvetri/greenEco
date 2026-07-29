import type { Role } from "@prisma/client";

/**
 * Display-only org-chart labels. `jobTitle` carries NO permission weight — `role`
 * (ADMIN/EMPLOYEE) remains the sole authorization signal everywhere in the app.
 * Do not add a branch anywhere that reads `jobTitle` to decide access.
 *
 * Free text since v42 — these are just the built-in suggestions shown in the
 * picker; an admin can type any other title and it's stored as-is.
 */
export const JOB_TITLES = [
  "MD",
  "SALES",
  "PROJECT_MANAGER",
  "PURCHASE",
  "SITE_ENGINEER",
  "STORE_MANAGER",
  "ACCOUNTANT",
  "OTHER",
] as const;

export const JOB_TITLE_LABELS: Record<string, string> = {
  MD: "Managing Director",
  SALES: "Sales",
  PROJECT_MANAGER: "Project Manager",
  PURCHASE: "Purchase",
  SITE_ENGINEER: "Site Engineer",
  STORE_MANAGER: "Store Manager",
  ACCOUNTANT: "Accountant",
  OTHER: "Other",
};

/** A known title shows its friendly label; a custom (free-typed) one shows as-is. */
export function jobTitleLabel(value: string): string {
  return JOB_TITLE_LABELS[value] ?? value;
}

/** A *suggested* starting role per built-in title, shown as a hint on the create-user
 *  form. The `role` field itself always stays independently editable — never silently
 *  inferred, since it is the security-relevant field. No entry for a custom title —
 *  callers must leave `role` untouched when the picked value isn't one of these keys. */
export const JOB_TITLE_DEFAULT_ROLE: Record<string, Role> = {
  MD: "ADMIN",
  SALES: "EMPLOYEE",
  PROJECT_MANAGER: "EMPLOYEE",
  PURCHASE: "ADMIN",
  SITE_ENGINEER: "EMPLOYEE",
  STORE_MANAGER: "ADMIN",
  ACCOUNTANT: "ADMIN",
  OTHER: "EMPLOYEE",
};
