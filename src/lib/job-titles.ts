import type { JobTitle, Role } from "@prisma/client";

/**
 * Display-only org-chart labels. `jobTitle` carries NO permission weight — `role`
 * (ADMIN/EMPLOYEE) remains the sole authorization signal everywhere in the app.
 * Do not add a branch anywhere that reads `jobTitle` to decide access.
 */
export const JOB_TITLES: JobTitle[] = [
  "MD",
  "SALES",
  "PROJECT_MANAGER",
  "PURCHASE",
  "SITE_ENGINEER",
  "STORE_MANAGER",
  "ACCOUNTANT",
  "OTHER",
];

export const JOB_TITLE_LABELS: Record<JobTitle, string> = {
  MD: "Managing Director",
  SALES: "Sales",
  PROJECT_MANAGER: "Project Manager",
  PURCHASE: "Purchase",
  SITE_ENGINEER: "Site Engineer",
  STORE_MANAGER: "Store Manager",
  ACCOUNTANT: "Accountant",
  OTHER: "Other",
};

/** A *suggested* starting role per title, shown as a hint on the create-user form.
 *  The `role` field itself always stays independently editable — never silently
 *  inferred, since it is the security-relevant field. */
export const JOB_TITLE_DEFAULT_ROLE: Record<JobTitle, Role> = {
  MD: "ADMIN",
  SALES: "EMPLOYEE",
  PROJECT_MANAGER: "EMPLOYEE",
  PURCHASE: "ADMIN",
  SITE_ENGINEER: "EMPLOYEE",
  STORE_MANAGER: "ADMIN",
  ACCOUNTANT: "ADMIN",
  OTHER: "EMPLOYEE",
};
