"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { IconName } from "@/lib/nav";
import { NavIcon } from "./icons";

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "bg-white text-emerald-900 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]"
          : "text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white",
      )}
    >
      {/* active accent bar hugging the sidebar edge */}
      <span
        className={cn(
          "absolute -left-2.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-300 to-teal-300 transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-emerald-100 text-emerald-700"
            : "bg-white/5 text-white/70 group-hover:bg-white/15 group-hover:text-white",
        )}
      >
        <NavIcon name={icon} className="size-[17px]" />
      </span>
      {label}
    </Link>
  );
}

export function BottomLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted",
      )}
    >
      <span className={cn("flex items-center justify-center rounded-lg px-3 py-0.5", active && "bg-primary-50")}>
        <NavIcon name={icon} className="size-5" />
      </span>
      {label}
    </Link>
  );
}
