"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, KeyRound, Mail, Building2, Phone, ShieldCheck, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Uploader } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import { updateProfileAction, updateEmailAction, changePasswordAction, updateAvatarAction, type ActionState } from "./actions";
import type { MyProfile } from "@/server/services/profile";

const EMPTY: ActionState = {};

type Section = null | "profile" | "email" | "password";

function AvatarEditor({ name, role, avatarUrl }: { name: string; role: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(avatarUrl);
  const [pending, start] = useTransition();

  function save(next: string | null) {
    start(async () => {
      try {
        await updateAvatarAction(next);
        setUrl(next);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update photo", "error");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary storage URL
        <img src={url} alt={name} className="size-14 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initials(name)}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold">{name}</div>
        <Badge variant={role === "ADMIN" ? "primary" : "default"}>
          <ShieldCheck className="size-3" /> {role === "ADMIN" ? "Admin" : "Field Staff"}
        </Badge>
        <div className="mt-1.5 flex items-center gap-2">
          <Uploader
            onUploaded={(files) => files[0] && save(files[0].url)}
            multiple={false}
            label={pending ? "Saving…" : url ? "Change photo" : "Add photo"}
          />
          {url && (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger disabled:opacity-50"
            >
              <X className="size-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One simple profile card: a read-only summary by default (what the client asked for —
 * "my profile is enough"), with small Edit / Change email / Change password links that
 * each reveal a minimal inline form only when clicked, collapsing back to the summary on
 * save. Replaces 3 permanently-open forms that made the page feel complicated.
 */
export function ProfileCard({ profile }: { profile: MyProfile }) {
  const [open, setOpen] = useState<Section>(null);
  const [pState, pAction, pPending] = useActionState(updateProfileAction, EMPTY);
  const [eState, eAction, ePending] = useActionState(updateEmailAction, EMPTY);
  const [wState, wAction, wPending] = useActionState(changePasswordAction, EMPTY);
  const pwFormRef = useRef<HTMLFormElement>(null);
  const emailFormRef = useRef<HTMLFormElement>(null);

  // Collapsing the form back to the read-only summary on a successful save is the whole
  // point of this component (see file header) — reacting to the server action's result is
  // exactly what these effects are for, so the setState-in-effect warning is expected here.
  useEffect(() => {
    if (pState.ok) {
      toast(pState.message ?? "Saved");
      setOpen(null);
    } else if (pState.error) toast(pState.error, "error");
  }, [pState]);

  useEffect(() => {
    if (eState.ok) {
      toast(eState.message ?? "Email changed");
      emailFormRef.current?.reset();
      setOpen(null);
    } else if (eState.error) toast(eState.error, "error");
  }, [eState]);

  useEffect(() => {
    if (wState.ok) {
      toast(wState.message ?? "Password changed");
      pwFormRef.current?.reset();
      setOpen(null);
    } else if (wState.error) toast(wState.error, "error");
  }, [wState]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AvatarEditor name={profile.name} role={profile.role} avatarUrl={profile.avatarUrl} />

        <dl className="space-y-2 text-sm">
          <ReadRow icon={Building2} label="Company" value={profile.companyName} />
          <ReadRow icon={Phone} label="Phone" value={profile.phone} />
          <ReadRow icon={Mail} label="Login email" value={profile.email ?? "Not set"} />
        </dl>

        {open === null && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setOpen("profile")}>
              <Pencil className="size-3.5" /> Edit profile
            </Button>
            {profile.hasPassword && (
              <>
                <Button size="sm" variant="outline" onClick={() => setOpen("email")}>
                  <Mail className="size-3.5" /> Change email
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpen("password")}>
                  <KeyRound className="size-3.5" /> Change password
                </Button>
              </>
            )}
          </div>
        )}

        {open === "profile" && (
          <form action={pAction} className="space-y-3 border-t border-border pt-4">
            <Field label="Full name">
              <Input name="name" defaultValue={profile.name} autoComplete="name" required />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={profile.phone} inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" required />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={pPending}>
                Save changes
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)} disabled={pPending}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {open === "email" && (
          <form ref={emailFormRef} action={eAction} className="space-y-3 border-t border-border pt-4">
            <Field label="New email">
              <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
            </Field>
            <Field label="Current password" hint="Confirms it's really you.">
              <Input name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={ePending}>
                Save changes
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)} disabled={ePending}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {open === "password" && (
          <form ref={pwFormRef} action={wAction} className="space-y-3 border-t border-border pt-4">
            <Field label="Current password">
              <Input name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password">
              <Input name="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" required />
            </Field>
            <Field label="Confirm new password">
              <Input name="confirmPassword" type="password" autoComplete="new-password" required />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={wPending}>
                Save changes
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)} disabled={wPending}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!profile.hasPassword && open === null && (
          <p className="text-xs text-muted">
            No password is set for this account yet — contact your administrator to set one up before changing email or password.
          </p>
        )}
      </CardContent>
    </Card>
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
