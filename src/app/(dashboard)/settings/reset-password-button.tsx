"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { adminResetPasswordAction } from "./actions";

/** Admin resets another user's password — no current-password check (that's the
 *  self-service flow on the profile card above). */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  const mismatch = confirm.length > 0 && newPassword !== confirm;

  function reset() {
    if (newPassword !== confirm) return;
    start(async () => {
      try {
        await adminResetPasswordAction(userId, newPassword);
        toast(`Password reset for ${name}`);
        setOpen(false);
        setNewPassword("");
        setConfirm("");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Reset failed", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reset password for ${name}`}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
      >
        <KeyRound className="size-3" /> Reset password
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Reset password — ${name}`}>
        <div className="space-y-3">
          <p className="text-xs text-muted">
            This immediately replaces {name}&apos;s password. They&apos;ll need to sign in with the new one.
          </p>
          <Field label="New password">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password" error={mismatch ? "Passwords do not match" : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || !newPassword || newPassword.length < 8 || mismatch}
              loading={pending}
              onClick={reset}
            >
              <KeyRound className="size-4" /> Reset password
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
