"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { adminUpdateUserAction } from "./actions";

/** Admin edits another user's core details — name/phone/email/role/active.
 *  Not rendered for the viewer's own row (see settings/page.tsx) — self-edits go
 *  through the profile card's current-password-checked flow instead. */
export function EditUserButton({
  userId,
  name,
  phone,
  email,
  role,
  active,
}: {
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, phone, email: email ?? "", role, active });
  const [pending, start] = useTransition();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    start(async () => {
      const res = await adminUpdateUserAction(userId, {
        name: form.name,
        phone: form.phone,
        email: form.email.trim() ? form.email.trim() : null,
        role: form.role,
        active: form.active,
      });
      if (res.ok) {
        toast(res.message ?? "User updated");
        setOpen(false);
        router.refresh();
      } else {
        toast(res.error ?? "Could not update user", "error");
      }
    });
  }

  const valid = form.name.trim() && form.phone.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${name}`}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
      >
        <Pencil className="size-3" /> Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Edit — ${name}`}>
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Phone" required>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" hint="Their sign-in username. Leave blank if they don't use credentials login.">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@greeneco.in" />
          </Field>
          <Field label="Access level" required>
            <Select value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <Field label="Status" hint="Deactivating blocks sign-in immediately, without deleting their account or history.">
            <Select value={form.active ? "active" : "inactive"} onChange={(e) => set("active", e.target.value === "active")}>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || !valid} loading={pending} onClick={submit}>
              <Pencil className="size-4" /> Save changes
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
