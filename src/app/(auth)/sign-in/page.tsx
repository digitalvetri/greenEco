"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { LogIn, ShieldCheck, Droplets, LineChart, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";
import { WaterCanvas } from "./water-canvas";

export const dynamic = "force-dynamic";

const BRAND_GRADIENT = "linear-gradient(155deg, #052a1c 0%, #0b5e39 30%, #128a55 56%, #1560bd 100%)";

const FEATURES = [
  { icon: Droplets, title: "Plant lifecycle", body: "Leads → proposals → projects → AMC." },
  { icon: LineChart, title: "Live economics", body: "Budget-vs-actual, receivables & GST." },
  { icon: ShieldCheck, title: "Role-aware", body: "Everyone sees exactly what they should." },
];

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.08fr_1fr]">
      {/* ── Brand panel: living water scene ────────────────────────────── */}
      <div className="relative hidden overflow-hidden lg:block" style={{ background: BRAND_GRADIENT }}>
        <WaterCanvas />
        {/* legibility vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_90%_at_15%_-10%,transparent_35%,rgba(3,22,15,0.45))]" />
        {/* water surface at the foot of the panel */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0,64 C240,110 480,20 720,52 C960,84 1200,120 1440,72 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.06)" />
          <path d="M0,84 C260,50 520,118 780,86 C1040,54 1260,96 1440,80 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.05)" />
        </svg>

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white xl:p-14">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo-mark-light.png" alt="Green Ecocare" width={56} height={56} className="size-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight">Green Ecocare</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">Private Limited</div>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white/85 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" /> Wastewater Operations Platform
            </div>
            <h2 className="text-4xl font-bold leading-[1.08] tracking-tight text-balance xl:text-[2.75rem]">
              Clean water,
              <br />
              from first enquiry to handover.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
              The operating system for Green Ecocare — sales, execution, service and finance, flowing through one workspace.
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md transition-colors hover:bg-white/15">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <f.icon className="size-[18px]" />
                  </span>
                  <div className="mt-2.5 text-sm font-semibold">{f.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-white/65">{f.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm font-medium italic tracking-wide text-white/75">
            <Droplets className="size-4" /> It&apos;s our future.
          </div>
        </div>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center overflow-hidden bg-surface px-5 py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative w-full max-w-sm">
          {/* mobile brand mark */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Image src="/brand/logo-mark-light.png" alt="Green Ecocare" width={72} height={72} className="mb-3 size-16 object-contain" />
            <div className="text-lg font-bold">Green Ecocare</div>
          </div>

          <div className="mb-6">
            <h1 className="text-[1.75rem] font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
          </div>

          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@greeneco.in"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" loading={pending} className="w-full transition-transform hover:-translate-y-0.5">
              <LogIn className="size-4" /> Sign in
            </Button>
          </form>

          <div className="mt-7 flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-xs text-muted">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            Your role — owner/admin or field staff — is set by your account.
          </div>
        </div>
      </div>
    </div>
  );
}
