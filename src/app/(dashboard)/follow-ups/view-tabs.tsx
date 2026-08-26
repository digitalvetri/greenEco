"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { List, CalendarDays } from "lucide-react";

/**
 * List | Calendar. Both are the SAME module reading the same service, so switching
 * carries the active filters across rather than resetting them.
 */
export function ViewTabs({ view }: { view: "list" | "calendar" }) {
  const params = useSearchParams();

  const href = (v: "list" | "calendar") => {
    const next = new URLSearchParams(params.toString());
    if (v === "list") next.delete("view");
    else next.set("view", v);
    const q = next.toString();
    return q ? `/follow-ups?${q}` : "/follow-ups";
  };

  const TABS = [
    { key: "list" as const, label: "List", icon: List },
    { key: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];

  return (
    <nav aria-label="Follow-up views" className="mb-4 flex gap-1.5">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = view === t.key;
        return (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted hover:text-fg")
            }
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
