"use client";

import { useActionState, useEffect, useRef } from "react";
import { User, KeyRound, Mail, Building2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateProfileAction, changePasswordAction, type ActionState } from "./actions";
import type { MyProfile } from "@/server/services/profile";

const EMPTY: ActionState = {};

export function ProfileCard({ profile }: { profile: MyProfile }) {
  const [pState, pAction, pPending] = useActionState(updateProfileAction, EMPTY);
  const [wState, wAction, wPending] = useActionState(changePasswordAction, EMPTY);
  const pwFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (pState.ok) toast(pState.message ?? "Saved");
    else if (pState.error) toast(pState.error, "error");
  }, [pState]);

  useEffect(() => {
    if (wState.ok) {
      toast(wState.message ?? "Password changed");
      pwFormRef.current?.reset();
    } else if (wState.error) toast(wState.error, "error");
  }, [wState]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Profile details */}
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
              {initials(profile.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{profile.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <Badge variant={profile.role === "ADMIN" ? "primary" : "default"}>
                  <ShieldCheck className="size-3" /> {profile.role === "ADMIN" ? "Owner / Admin" : "Field Staff"}
                </Badge>
              </div>
            </div>
          </div>

          <dl className="mb-4 space-y-1.5 text-sm">
            <ReadRow icon={Mail} label="Email" value={profile.email ?? "Not set"} />
            <ReadRow icon={Building2} label="Company" value={profile.companyName} />
          </dl>

          <form action={pAction} className="space-y-3">
            <Field label="Full name">
              <Input name="name" defaultValue={profile.name} autoComplete="name" required />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={profile.phone} inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" required />
            </Field>
            <Button type="submit" size="sm" loading={pPending}>
              <User className="size-4" /> Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.hasPassword ? (
            <form ref={pwFormRef} action={wAction} className="space-y-3">
              <Field label="Current password">
                <Input name="currentPassword" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password">
                <Input name="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" required />
              </Field>
              <Field label="Confirm new password">
                <Input name="confirmPassword" type="password" autoComplete="new-password" required />
              </Field>
              <Button type="submit" size="sm" loading={wPending}>
                <KeyRound className="size-4" /> Change password
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              No password is set for this account yet. Please contact your administrator to set one up.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("") || "U"
  ).toUpperCase();
}
