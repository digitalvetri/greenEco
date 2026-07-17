"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import type { JobTitle, Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { JOB_TITLES, JOB_TITLE_LABELS, JOB_TITLE_DEFAULT_ROLE } from "@/lib/job-titles";
import { createUserAction } from "./actions";

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  password: "",
  role: "EMPLOYEE" as Role,
  jobTitle: "" as JobTitle | "",
};

/** Admin-only. Only rendered when AUTH_MODE !== "clerk" — Clerk mode provisions
 *  users via its own webhook/dashboard, not this form. */
export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pending, start] = useTransition();

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // jobTitle only *suggests* a starting role, and only while the admin hasn't
      // touched role themselves — role stays independently, explicitly editable.
      if (key === "jobTitle" && value) next.role = JOB_TITLE_DEFAULT_ROLE[value as JobTitle];
      return next;
    });
  }

  function submit() {
    start(async () => {
      const res = await createUserAction({
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        role: form.role,
        jobTitle: form.jobTitle || null,
      });
      if (res.ok) {
        toast(`${form.name} can now sign in`);
        setOpen(false);
        setForm(EMPTY);
      } else {
        toast(res.error ?? "Could not create user", "error");
      }
    });
  }

  const valid = form.name.trim() && form.phone.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Add user
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a new user">
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Priya Kumar" />
          </Field>
          <Field label="Phone" required>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9876543210" />
          </Field>
          <Field label="Email" required hint="This is their sign-in username.">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@greeneco.in" />
          </Field>
          <Field label="Temporary password" required hint="At least 8 characters. Share this with them directly.">
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Job title" hint="Display label only — does not change what they can access.">
            <Select value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value as JobTitle | "")}>
              <option value="">— None —</option>
              {JOB_TITLES.map((t) => (
                <option key={t} value={t}>
                  {JOB_TITLE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Access level" required hint="Controls what they can see and do — set this deliberately.">
            <Select value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || !valid} loading={pending} onClick={submit}>
              <UserPlus className="size-4" /> Create user
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
