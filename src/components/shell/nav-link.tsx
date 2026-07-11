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
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-white text-emerald-900 shadow-sm"
          : "text-white/75 hover:bg-white/10 hover:text-white",
      )}
    >
      <NavIcon
        name={icon}
        className={cn("size-[18px] shrink-0", active ? "text-emerald-700" : "text-white/70 group-hover:text-white")}
      />
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
