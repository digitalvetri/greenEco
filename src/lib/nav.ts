import type { Role } from "@prisma/client";

/**
 * Nav config. `icon` is a STRING key (not a component) so nav items can be
 * passed from Server Components into Client nav components — a React component
 * function cannot cross the RSC boundary. The key resolves via the client-side
 * icon registry in components/shell/icons.tsx.
 */
export type IconName =
  | "dashboard"
  | "leads"
  | "proposals"
  | "projects"
  | "service"
  | "clients"
  | "materials"
  | "erection"
  | "invoices"
  | "reports"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  /** Show in the mobile bottom bar (max 5). */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", mobile: true },
  { href: "/leads", label: "Leads", icon: "leads", mobile: true },
  { href: "/proposals", label: "Proposals", icon: "proposals", mobile: true },
  { href: "/projects", label: "Projects", icon: "projects", mobile: true },
  { href: "/service", label: "Service / AMC", icon: "service" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/materials", label: "Materials", icon: "materials" },
  { href: "/erection", label: "Erection", icon: "erection", mobile: true },
  { href: "/invoices", label: "Invoices", icon: "invoices", adminOnly: true },
  { href: "/reports", label: "Reports", icon: "reports", adminOnly: true },
  { href: "/settings", label: "Settings", icon: "settings", adminOnly: true },
];

/**
 * Sidebar / drawer grouping (desktop + mobile). Empty groups are skipped, so
 * role-filtered nav (EMPLOYEE has no Finance/System) collapses cleanly.
 */
export const NAV_SECTIONS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/dashboard"] },
  { label: "Sales", hrefs: ["/leads", "/proposals", "/clients"] },
  { label: "Operations", hrefs: ["/projects", "/service", "/materials", "/erection"] },
  { label: "Finance", hrefs: ["/invoices", "/reports"] },
  { label: "System", hrefs: ["/settings"] },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.adminOnly || role === "ADMIN");
}

export function mobileNavFor(role: Role): NavItem[] {
  return navFor(role)
    .filter((i) => i.mobile)
    .slice(0, 5);
}
