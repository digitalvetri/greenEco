"use client";

import { HeartPulse, AlertTriangle, ShieldAlert } from "lucide-react";

/**
 * Live site-health monitor: an animated ECG heartbeat line (colour = worst tone),
 * a pulsing "Live" badge, and a proportional health-distribution bar. Pure CSS/SVG
 * animation (reduced-motion safe via .gc-ecg-track). Data comes from the dashboard.
 */

// One tiled half of the waveform (two beats over a 240-wide viewBox); rendered twice.
const ECG_POINTS =
  "0,40 44,40 50,40 55,15 61,66 67,27 73,40 118,40 164,40 170,40 175,15 181,66 187,27 193,40 240,40";

const TONE = {
  ok: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
} as const;

export function SiteHealthMonitor({
  total,
  healthy,
  warning,
  critical,
}: {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
}) {
  const tone: keyof typeof TONE = critical > 0 ? "danger" : warning > 0 ? "warn" : "ok";
  const line = TONE[tone];
  const denom = Math.max(1, total);
  const pct = (n: number) => `${(n / denom) * 100}%`;
  const status = critical > 0 ? "Critical attention" : warning > 0 ? "Needs attention" : "All systems healthy";

  return (
    <>
      <div className="relative h-[190px] overflow-hidden rounded-xl bg-gradient-to-br from-sky-100 via-emerald-50 to-teal-100 dark:from-sky-950 dark:via-emerald-950 dark:to-teal-950">
        {/* faint monitor grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Live badge */}
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-card/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/70 backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full opacity-70" style={{ background: line }} />
            <span className="relative inline-flex size-2 rounded-full" style={{ background: line }} />
          </span>
          Live
        </div>

        {/* animated heartbeat */}
        <div className="absolute inset-x-0 top-1/2 h-24 -translate-y-1/2 overflow-hidden">
          <div className="gc-ecg-track flex h-full">
            {[0, 1].map((k) => (
              <svg key={k} viewBox="0 0 240 80" preserveAspectRatio="none" className="h-full w-1/2 shrink-0" aria-hidden>
                <polyline
                  points={ECG_POINTS}
                  fill="none"
                  stroke={line}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
              </svg>
            ))}
          </div>
        </div>

        {/* status + active sites */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-xs font-medium" style={{ color: line }}>
          <HeartPulse className="size-3.5" /> {status}
        </div>
        <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-card/80 px-2 py-1 text-[11px] font-medium text-muted backdrop-blur">
          {total} active sites
        </div>
      </div>

      {/* distribution bar */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
        {healthy > 0 && <div style={{ width: pct(healthy), background: TONE.ok }} />}
        {warning > 0 && <div style={{ width: pct(warning), background: TONE.warn }} />}
        {critical > 0 && <div style={{ width: pct(critical), background: TONE.danger }} />}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat icon={HeartPulse} tone="ok" value={healthy} label="Healthy" />
        <Stat icon={AlertTriangle} tone="warn" value={warning} label="Warning" />
        <Stat icon={ShieldAlert} tone="danger" value={critical} label="Critical" />
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: typeof HeartPulse;
  tone: "ok" | "warn" | "danger";
  value: number;
  label: string;
}) {
  const c = tone === "ok" ? "text-ok bg-ok-soft" : tone === "warn" ? "text-warn bg-warn-soft" : "text-danger bg-danger-soft";
  return (
    <div className="rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/30">
      <span className={`mx-auto flex size-8 items-center justify-center rounded-full ${c}`}>
        <Icon className="size-4" />
      </span>
      <div className="mt-1 text-lg font-bold leading-none tabular-nums">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
