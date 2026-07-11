import { CalendarDays, Droplets, Sparkles } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getNotifications } from "@/server/services/notifications";
import { navFor, mobileNavFor } from "@/lib/nav";
import { env } from "@/lib/env";
import { SidebarLink, BottomLink } from "@/components/shell/nav-link";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { GlobalSearch } from "@/components/shell/global-search";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { OfflineBar } from "@/components/pwa/offline-bar";
import { Toaster } from "@/components/ui/toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const items = navFor(session.role);
  const notifications = await getNotifications(session);
  const mobileItems = mobileNavFor(session.role);
  const initials =
    session.name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("") || "U";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <OfflineBar />
      <Toaster />

      {/* Persistent sidebar — laptop & desktop (>=1024px) */}
      <aside className="gc-sidebar hidden w-[264px] shrink-0 flex-col lg:flex">
        <div className="relative z-10 flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur">
            <Droplets className="size-5" />
          </span>
          <div className="leading-tight text-white">
            <div className="text-base font-bold tracking-tight">GreenEco CRM</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-white/60">Wastewater Ops</div>
          </div>
        </div>

        <nav className="relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {items.map((i) => (
            <SidebarLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
          ))}
        </nav>

        <div className="relative z-10 mx-3 mb-3 shrink-0 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white">
            <Sparkles className="size-4" />
          </span>
          <div className="mt-2 text-sm font-semibold text-white">Cleaner Water, Better Tomorrow</div>
          <p className="mt-0.5 text-[11px] text-white/70">AI-assisted proposals, AMC & compliance.</p>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-2.5 border-t border-white/10 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">
            {initials}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold text-white">{session.name}</div>
            <div className="text-[11px] text-white/60">{session.role === "ADMIN" ? "Owner / Admin" : "Field Staff"}</div>
          </div>
          {env.authMode === "dev" && <RoleSwitcher current={session.role} />}
        </div>
      </aside>

      {/* Main column — scrolls independently */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur-md md:gap-3 md:px-6">
          <MobileNav items={items} name={session.name} role={session.role} initials={initials} />
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
            <NotificationsMenu items={notifications} />
            <Link
              href="/service"
              aria-label="Maintenance schedule"
              className="hidden size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground md:flex"
            >
              <CalendarDays className="size-[18px]" />
            </Link>
            <ThemeToggle />
            <Link
              href="/settings"
              className="ml-1 hidden items-center gap-2 rounded-xl border border-border bg-surface py-1 pl-2 pr-2.5 transition-colors hover:border-primary/40 xl:flex"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Droplets className="size-4" />
              </span>
              <span className="text-xs font-semibold">Green Ecocare</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-5 md:px-7 md:py-6">{children}</div>
        </main>

        {/* Bottom nav — mobile only (<768px), sits below scrolling content */}
        <nav className="flex shrink-0 border-t border-border bg-card md:hidden">
          {mobileItems.map((i) => (
            <BottomLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function RoleSwitcher({ current }: { current: string }) {
  const other = current === "ADMIN" ? "EMPLOYEE" : "ADMIN";
  return (
    <Link
      href={`/api/dev/role?role=${other}`}
      className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80 transition-colors hover:bg-white/20"
      title="Dev-only: switch role"
    >
      as {other}
    </Link>
  );
}
