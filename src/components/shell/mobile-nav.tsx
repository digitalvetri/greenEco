"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconName } from "@/lib/nav";
import { NavIcon } from "./icons";

interface Item {
  href: string;
  label: string;
  icon: IconName;
}

/** Hamburger + slide-in drawer for tablet/mobile (all sections reachable). */
export function MobileNav({
  items,
  name,
  role,
  initials,
}: {
  items: Item[];
  name: string;
  role: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open &&
        mounted &&
        createPortal(
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="gc-sidebar absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col shadow-2xl">
            <div className="relative z-10 flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
                  <Droplets className="size-5" />
                </span>
                <div className="leading-tight text-white">
                  <div className="text-base font-bold tracking-tight">GreenEco CRM</div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-white/60">Wastewater Ops</div>
                </div>
              </div>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>

            <nav className="relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
              {items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active ? "bg-white text-emerald-900" : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <NavIcon name={i.icon} className={cn("size-[18px] shrink-0", active ? "text-emerald-700" : "text-white/70")} />
                    {i.label}
                  </Link>
                );
              })}
            </nav>

            <div className="relative z-10 flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">
                {initials}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-white">{name}</div>
                <div className="text-[11px] text-white/60">{role === "ADMIN" ? "Owner / Admin" : "Field Staff"}</div>
              </div>
            </div>
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}
