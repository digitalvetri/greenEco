"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { CAPABILITY_LABELS, type Capability } from "@/lib/rbac";
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
  capabilities,
}: {
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  active: boolean;
  capabilities: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, phone, email: email ?? "", role, active, capabilities });
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
        capabilities: form.capabilities,
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
          {/* Extra permissions, granted one at a time. An admin already holds every
              capability implicitly, so the section is hidden for them rather than
              showing checkboxes that would have no effect. */}
          {form.role !== "ADMIN" && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 text-sm font-medium">Extra access</div>
              <p className="mb-2 text-xs text-muted">
                Grant one thing at a time, instead of making them a full admin.
              </p>
              {(Object.keys(CAPABILITY_LABELS) as Capability[]).map((cap) => {
                const on = form.capabilities.includes(cap);
                return (
                  <label key={cap} className="flex cursor-pointer items-start gap-2 py-1.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-[var(--gc-primary,#0f7a4d)]"
                      checked={on}
                      onChange={(e) =>
                        set(
                          "capabilities",
                          e.target.checked
                            ? [...form.capabilities, cap]
                            : form.capabilities.filter((c) => c !== cap),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{CAPABILITY_LABELS[cap].label}</span>
                      <span className="block text-xs text-muted">{CAPABILITY_LABELS[cap].description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {form.role === "ADMIN" && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
              Admins already have every permission, including drawings.
            </p>
          )}

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
