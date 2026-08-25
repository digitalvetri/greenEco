"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Inbox, BarChart3 } from "lucide-react";

/**
 * Sub-nav for the Proposals sections, copying the Materials sub-nav pattern.
 *
 * **Requests is `adminOnly: false` on purpose.** It is the FIELD-STAFF entry point —
 * the whole reason it exists is that an employee can ask the office for a quote.
 * Hiding it from employees would reproduce the exact v27 bug where the material
 * request flow was unreachable for the only people meant to use it.
 *
 * Role-filtering here is navigation only; the security boundary stays in the
 * service layer (`requireAdmin` on review, ownership scoping on the list).
 */
const SECTIONS = [
  { href: "/proposals", label: "Proposals", icon: FileText, adminOnly: false },
  { href: "/proposals/requests", label: "Requests", icon: Inbox, adminOnly: false },
  { href: "/proposals/analytics", label: "Analytics", icon: BarChart3, adminOnly: false },
] as const;

export function ProposalsNav({ isAdmin, requestCount }: { isAdmin: boolean; requestCount?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Proposals sections" className="mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
      {SECTIONS.filter((s) => isAdmin || !s.adminOnly).map((s) => {
        // "/proposals" must match the exact path only, else it is active on every child.
        const active = s.href === "/proposals" ? pathname === "/proposals" : pathname.startsWith(s.href);
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors " +
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
