import { CalendarDays } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";
import { getNotifications, unreadCount } from "@/server/services/notifications";
import { navFor, mobileNavFor, NAV_SECTIONS } from "@/lib/nav";
import { SidebarLink, BottomLink } from "@/components/shell/nav-link";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { GlobalSearch } from "@/components/shell/global-search";
import { MobileNav } from "@/components/shell/mobile-nav";
import { LogoutButton } from "@/components/shell/logout-button";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { OfflineBar } from "@/components/pwa/offline-bar";
import { Toaster } from "@/components/ui/toast";
import { EcoChat } from "@/components/eco/eco-chat";

// The dashboard is per-request (auth + tenant data) — never statically prerendered,
// so getSession()'s fail-closed 401 can't fire at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const items = navFor(session.role);
  const [notifications, notificationsUnread] = await Promise.all([getNotifications(session), unreadCount(session)]);
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
      <EcoChat />

      {/* Persistent sidebar — laptop & desktop (>=1024px) */}
      <aside className="gc-sidebar hidden w-[264px] shrink-0 flex-col lg:flex">
        <div className="relative z-10 flex items-center gap-2.5 px-5 pb-4 pt-5">
          <Image src="/brand/logo-mark-light.png" alt="Green Ecocare" width={44} height={44} className="size-11 shrink-0 object-contain" />
          <div className="leading-tight text-white">
            <div className="text-base font-bold tracking-tight">Green Ecocare</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-emerald-200/80">Wastewater Ops</div>
          </div>
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
                <div className="flex flex-col gap-0.5">
                  {secItems.map((i) => (
                    <SidebarLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative z-10 flex shrink-0 items-center gap-1 border-t border-white/10 px-3 py-3">
          <Link
            href="/settings"
            title="Profile & settings"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/10"
          >
            {session.avatarUrl ? (
              <Image
                src={session.avatarUrl}
                alt={session.name}
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
              <div className="truncate text-sm font-semibold text-white">{session.name}</div>
              <div className="text-[11px] text-emerald-200/70">{session.role === "ADMIN" ? "Admin" : "Field Staff"}</div>
            </div>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      {/* Main column — scrolls independently */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur-md md:gap-3 md:px-6">
          <MobileNav items={items} name={session.name} role={session.role} initials={initials} avatarUrl={session.avatarUrl} />
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
            <NotificationsMenu items={notifications} unreadCount={notificationsUnread} />
            <Link
              href="/follow-ups"
              aria-label="Follow-ups"
              title="Follow-ups"
              className="hidden size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground md:flex"
            >
              <CalendarDays className="size-[18px]" />
            </Link>
            <ThemeToggle />
            <Link
              href="/settings"
              className="ml-1 hidden items-center gap-2 rounded-xl border border-border bg-surface py-1 pl-2 pr-2.5 transition-colors hover:border-primary/40 xl:flex"
            >
              <span className="flex size-7 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border">
                <Image src="/brand/logo-mark.png" alt="" width={28} height={28} className="size-6 object-contain" />
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

