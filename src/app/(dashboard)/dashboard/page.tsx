import Link from "next/link";
import {
  HardHat,
  Users,
  LifeBuoy,
  IndianRupee,
  Plus,
  ArrowRight,
  HeartPulse,
  AlertTriangle,
  ShieldAlert,
  Droplets,
  Leaf,
  Recycle,
  UsersRound,
  CalendarClock,
  Activity as ActivityIcon,
  Waves,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { getRichDashboard, getOpsKpis } from "@/server/services/dashboard-rich";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/money";
import { DonutChart, RevenueArea } from "./rich-charts";
import { GreetingMeta } from "./greeting";

export const dynamic = "force-dynamic";

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const HERO = {
  blue: "text-c-blue",
  emerald: "text-c-emerald",
  violet: "text-c-violet",
  amber: "text-c-amber",
} as const;

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function DashboardPage() {
  const session = await getSession();
  const [d, ops] = await Promise.all([getRichDashboard(session), getOpsKpis(session)]);
  const firstName = session.name.split(" ")[0];

  return (
    <div className="gc-animate-in space-y-5">
      {/* Greeting header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greetingWord()}, {firstName}! <span className="align-middle">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s happening with your wastewater operations today.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <GreetingMeta />
          <Link
            href="/leads/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md"
          >
            <Plus className="size-4" /> New
          </Link>
        </div>
      </div>

      {/* Hero stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroStat tone="blue" icon={HardHat} label="Active Projects" value={d.hero.activeProjects} href="/projects" />
        <HeroStat tone="emerald" icon={Users} label="Total Clients" value={d.hero.totalClients} href="/clients" />
        <HeroStat tone="violet" icon={LifeBuoy} label="Open Service Requests" value={d.hero.openServiceRequests} href="/service" />
        {d.isAdmin && d.revenue != null ? (
          <HeroStat tone="amber" icon={IndianRupee} label="Revenue Collected" value={formatINR(d.revenue)} href="/reports" />
        ) : (
          <HeroStat tone="amber" icon={LifeBuoy} label="Proposals in Play" value={d.projectOverview[0].value} href="/proposals" />
        )}
      </div>

      {/* Across-the-business KPIs (reuse per-module analytics; money admin-only) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <OpsKpi label="Receivables" value={ops.receivables > 0 ? compactINR(ops.receivables) : "—"} hint={`${ops.overduePayments} overdue`} href="/reports" tone={ops.overduePayments > 0 ? "warn" : "ok"} />
        {ops.amcRunRate != null && <OpsKpi label="AMC run-rate" value={ops.amcRunRate > 0 ? compactINR(ops.amcRunRate) : "—"} href="/service/analytics" tone="ok" />}
        {ops.stockValue != null && <OpsKpi label="Stock value" value={ops.stockValue > 0 ? compactINR(ops.stockValue) : "—"} hint={ops.lowStock != null ? `${ops.lowStock} low` : undefined} href="/materials/analytics" tone={ops.lowStock ? "warn" : "default"} />}
        {ops.erectionOverruns != null && <OpsKpi label="Budget overruns" value={ops.erectionOverruns} href="/erection/analytics" tone={ops.erectionOverruns > 0 ? "danger" : "default"} />}
      </div>

      {/* Main + right rail */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* LEFT (2 cols) */}
        <div className="space-y-5 lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Project Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Project Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={d.projectOverview} total={d.projectTotal} />
                <div className="mt-3 space-y-2">
                  {d.projectOverview.map((p) => (
                    <div key={p.label} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
                      </span>
                      <span className="tabular-nums text-muted">
                        {p.value} {d.projectTotal > 0 && `(${Math.round((p.value / d.projectTotal) * 100)}%)`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Site Health */}
            <Card>
              <CardHeader>
                <CardTitle>Site Health Monitor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative flex h-[190px] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-100 via-emerald-50 to-teal-100 dark:from-sky-950 dark:via-emerald-950 dark:to-teal-950">
                  <Waves className="size-20 text-teal-500/50" />
                  <div className="absolute bottom-3 right-3 rounded-lg bg-card/80 px-2 py-1 text-[11px] font-medium text-muted backdrop-blur">
                    {d.health.total} active sites
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Health icon={HeartPulse} tone="ok" value={d.health.healthy} label="Healthy" />
                  <Health icon={AlertTriangle} tone="warn" value={d.health.warning} label="Warning" />
                  <Health icon={ShieldAlert} tone="danger" value={d.health.critical} label="Critical" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Recent Projects */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Projects</CardTitle>
                <Link href="/projects" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.recentProjects.length === 0 && <p className="text-sm text-muted">No projects yet.</p>}
                {d.recentProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-teal-400/20 text-primary">
                      <Droplets className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{p.progress}%</span>
                      </div>
                      <div className="text-xs text-muted">{p.phase}</div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {d.isAdmin ? (
                  <>
                    <div className="mb-1 text-2xl font-bold tabular-nums">{formatINR(d.revenue ?? "0")}</div>
                    <div className="mb-2 text-xs text-muted">Total collected</div>
                    <RevenueArea data={d.revenueSeries} />
                  </>
                ) : (
                  <div className="flex h-[240px] flex-col items-center justify-center text-center text-sm text-muted">
                    <IndianRupee className="mb-2 size-8 text-primary/40" />
                    Revenue is visible to admins only.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Environmental impact + Alert */}
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900/40 dark:from-emerald-950/40 dark:to-teal-950/30">
              <CardHeader>
                <CardTitle className="text-emerald-700 dark:text-emerald-400">Environmental Impact (YTD)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Impact icon={Droplets} value={`${d.env.gallonsTreatedM}M`} label="Gallons treated" />
                <Impact icon={Leaf} value={`${d.env.efficiencyPct}%`} label="Efficiency rate" />
                <Impact icon={Recycle} value={`${d.env.pollutantsTons}`} label="Tons pollutants removed" />
                <Impact icon={UsersRound} value={`${(d.env.peopleServed / 1000).toFixed(1)}K`} label="People served" />
              </CardContent>
            </Card>

            {d.alert ? (
              <Link href={d.alert.href} className="block">
                <Card className="h-full border-danger/30 bg-gradient-to-br from-rose-50 to-red-50 transition-all hover:shadow-md dark:from-rose-950/40 dark:to-red-950/30">
                  <CardContent className="flex h-full flex-col justify-center pt-4">
                    <div className="mb-1 flex items-center gap-2 font-semibold text-danger">
                      <AlertTriangle className="size-5" /> {d.alert.title}
                    </div>
                    <p className="text-sm text-foreground/80">{d.alert.detail}</p>
                    <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white">
                      View details <ArrowRight className="size-3.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card className="h-full">
                <CardContent className="flex h-full flex-col items-center justify-center py-8 text-center text-sm text-muted">
                  <HeartPulse className="mb-2 size-8 text-ok/50" />
                  All systems healthy — no critical alerts.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.tasks.length === 0 && <p className="text-sm text-muted">Nothing scheduled.</p>}
              {d.tasks.map((t, i) => {
                const dt = new Date(t.date);
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center">
                      <span className="text-[9px] font-semibold uppercase text-muted">{dt.toLocaleString("en-IN", { month: "short" })}</span>
                      <span className="text-sm font-bold leading-none">{dt.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-muted">{t.subtitle}</div>
                    </div>
                    <Badge variant={t.priority === "High" ? "danger" : "warn"}>{t.priority}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.activity.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
              {d.activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ActivityIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{a.action}</span> <span className="text-muted">{a.entity}</span>
                    </div>
                    <div className="text-[11px] text-muted">{timeAgo(a.at)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {d.isAdmin && d.topClients.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Clients</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {d.topClients.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatINR(c.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function OpsKpi({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href: string; tone: "ok" | "warn" | "danger" | "default" }) {
  const t = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${t}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </Link>
  );
}

function HeroStat({
  tone,
  icon: Icon,
  label,
  value,
  href,
}: {
  tone: keyof typeof HERO;
  icon: typeof HardHat;
  label: string;
  value: string | number;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <div className={`gc-hero ${HERO[tone]} rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}>
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-muted">{label}</div>
            <div className="mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">{value}</div>
          </div>
          <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}>
            <Icon className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Health({ icon: Icon, tone, value, label }: { icon: typeof HeartPulse; tone: "ok" | "warn" | "danger"; value: number; label: string }) {
  const c = tone === "ok" ? "text-ok bg-ok-soft" : tone === "warn" ? "text-warn bg-warn-soft" : "text-danger bg-danger-soft";
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <span className={`mx-auto flex size-8 items-center justify-center rounded-full ${c}`}>
        <Icon className="size-4" />
      </span>
      <div className="mt-1 text-lg font-bold leading-none tabular-nums">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function Impact({ icon: Icon, value, label }: { icon: typeof Droplets; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/70 text-emerald-600 shadow-sm dark:bg-white/10">
        <Icon className="size-5" />
      </span>
      <div>
        <div className="text-lg font-bold leading-none tabular-nums">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
