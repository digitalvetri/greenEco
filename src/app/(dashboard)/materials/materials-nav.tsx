"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ShoppingCart, ArrowLeftRight, ClipboardList } from "lucide-react";

/**
 * Sub-nav for the Materials sections. Replaces the old single page that stacked
 * seven cards (plus nested tabs) into ~3 screens of scrolling.
 *
 * Role-filtered for *navigation* only — the security boundary stays in the service
 * layer (`requireAdmin` / `stripPricing`). Each admin page also 404s a non-admin.
 */
const SECTIONS = [
  { href: "/materials", label: "Stock", icon: Boxes, adminOnly: false },
  { href: "/materials/purchasing", label: "Purchasing", icon: ShoppingCart, adminOnly: true },
  { href: "/materials/operations", label: "Operations", icon: ArrowLeftRight, adminOnly: true },
  { href: "/materials/requests", label: "Requests", icon: ClipboardList, adminOnly: false },
] as const;

export function MaterialsNav({ isAdmin, requestCount }: { isAdmin: boolean; requestCount?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Materials sections" className="mb-4 flex flex-wrap gap-1.5">
      {SECTIONS.filter((s) => isAdmin || !s.adminOnly).map((s) => {
        // "/materials" must only be active on the exact path, else it matches every child.
        const active = s.href === "/materials" ? pathname === "/materials" : pathname.startsWith(s.href);
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted hover:text-fg")
            }
          >
            <Icon className="size-4" />
            {s.label}
            {s.label === "Requests" && requestCount ? (
              <span
                className={
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                  (active ? "bg-white/20" : "bg-warn/15 text-warn")
                }
              >
                {requestCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
