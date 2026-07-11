"use client";

import { useActionState } from "react";
import { Droplets, LogIn } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Droplets className="size-6" />
          </span>
          <h1 className="text-xl font-bold">GreenEco CRM</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
        </div>

        <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {state?.error && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {state.error}
            </div>
          )}
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" placeholder="you@company.com" required autoFocus />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            <LogIn className="size-4" /> Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Your role (admin or field staff) is determined by your account.
        </p>
      </div>
    </div>
  );
}
