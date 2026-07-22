"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { type IconName, NAV_SECTIONS } from "@/lib/nav";
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
  avatarUrl,
}: {
  items: Item[];
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string | null;
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
        <div className="fixed inset-0 z-[70] h-[100dvh] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="gc-sidebar absolute inset-y-0 left-0 flex h-[100dvh] w-[80%] max-w-[300px] flex-col shadow-2xl">
            <div className="relative z-10 flex items-center justify-between px-5 pb-4 pt-5">
              <div className="flex items-center gap-2.5">
                <Image src="/brand/logo-mark-light.png" alt="Green Ecocare" width={44} height={44} className="size-11 shrink-0 object-contain" />
                <div className="leading-tight text-white">
                  <div className="text-base font-bold tracking-tight">Green Ecocare</div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-emerald-200/80">Wastewater Ops</div>
                </div>
              </div>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative z-10 mx-5 h-px bg-gradient-to-r from-white/20 via-white/10 to-transparent" />

            <nav className="relative z-10 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
              {NAV_SECTIONS.map((section) => {
                const secItems = items.filter((i) => section.hrefs.includes(i.href));
                if (!secItems.length) return null;
                return (
                  <div key={section.label ?? "main"} className="mb-1">
                    {section.label && (
                      <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                        {section.label}
                      </div>
                    )}
                    {secItems.map((i) => {
                      const active = pathname === i.href || pathname.startsWith(i.href + "/");
                      return (
                        <Link
                          key={i.href}
                          href={i.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all",
                            active
                              ? "bg-white text-emerald-900 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]"
                              : "text-white/75 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                              active ? "bg-emerald-100 text-emerald-700" : "bg-white/5 text-white/70 group-hover:bg-white/15 group-hover:text-white",
                            )}
                          >
                            <NavIcon name={i.icon} className="size-[17px]" />
                          </span>
                          {i.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            <div className="relative z-10 flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={name}
                  width={36}
                  height={36}
                  unoptimized
                  className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/25"
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/40 to-teal-400/30 text-sm font-bold text-white ring-1 ring-white/25">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-white">{name}</div>
                <div className="text-[11px] text-emerald-200/70">{role === "ADMIN" ? "Admin" : "Field Staff"}</div>
              </div>
            </div>
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}
