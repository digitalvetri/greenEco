"use client";

import { useActionState } from "react";
import Image from "next/image";
import { LogIn, ShieldCheck, Droplets, LineChart } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Droplets, title: "Plant lifecycle, end to end", body: "Leads → proposals → projects → AMC in one place." },
  { icon: LineChart, title: "Live cost & revenue", body: "Budget-vs-actual, receivables and GST, always current." },
  { icon: ShieldCheck, title: "Role-aware & secure", body: "Field staff and owners see exactly what they should." },
];

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={{ background: "linear-gradient(135deg, #0b5e39 0%, #158a53 45%, #1560bd 100%)" }}>
        {/* decorative brand-tinted glows */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-30 blur-3xl" style={{ background: "#3fae29" }} />
        <div className="pointer-events-none absolute -bottom-28 -left-16 size-96 rounded-full opacity-25 blur-3xl" style={{ background: "#1e88e5" }} />

        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-white/40">
            <Image src="/brand/logo-mark.png" alt="Green Ecocare" width={44} height={44} className="size-9 object-contain" />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold">Green Ecocare</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">Private Limited</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-balance">Wastewater treatment, managed from first enquiry to handover.</h2>
          <p className="mt-3 text-sm text-white/80">The operating system for Green Ecocare — sales, execution, service and finance, in one workspace.</p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <f.icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{f.title}</div>
                  <div className="text-xs text-white/70">{f.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-sm font-medium italic tracking-wide text-white/80">It&apos;s our future.</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
              <Image src="/brand/logo-mark.png" alt="Green Ecocare" width={64} height={64} className="size-14 object-contain" />
            </span>
            <div className="text-lg font-bold">Green Ecocare</div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
          </div>

          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="username" placeholder="you@greeneco.in" required autoFocus />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              <LogIn className="size-4" /> Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Your role — owner/admin or field staff — is set by your account.
          </p>
        </div>
      </div>
    </div>
  );
}
