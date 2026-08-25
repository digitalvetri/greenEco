"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Library } from "lucide-react";

/**
 * Sub-nav for the Drawings module, copying the Materials/Proposals pattern.
 *
 * Both entries are visible to everyone — an employee without the DRAWINGS capability
 * still tracks the requests they raised and opens drawings on their own projects. The
 * service decides what's IN each view; hiding the tab would only make the module look
 * broken to the people it's partly for.
 */
const SECTIONS = [
  { href: "/drawings", label: "Requests", icon: Inbox },
  { href: "/drawings/library", label: "Drawing library", icon: Library },
] as const;

export function DrawingsNav({ canDraw, openCount }: { canDraw: boolean; openCount?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Drawings sections" className="mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
      {SECTIONS.map((s) => {
        const active = s.href === "/drawings" ? pathname === "/drawings" : pathname.startsWith(s.href);
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
            {s.label === "Requests" && openCount ? (
              <span
                className={
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                  (active ? "bg-white/20" : "bg-warn/15 text-warn")
                }
              >
                {openCount}
              </span>
            ) : null}
          </Link>
        );
      })}
      {!canDraw && (
        <span className="ml-auto self-center text-xs text-muted">
          View-only — ask an admin for drawing access
        </span>
      )}
    </nav>
  );
}
