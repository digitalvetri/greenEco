"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { addLeadContactAction, deleteLeadContactAction } from "../actions";

interface Contact {
  id: string;
  name: string;
  designation: string | null;
  mobile: string;
}

/**
 * Contact persons on a lead (secretary, manager, engineer…) — separate from the lead's
 * primary phone. Add/remove any time (previously only fillable on the New Lead form).
 */
export function ContactsCard({ leadId, contacts }: { leadId: string; contacts: Contact[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", designation: "", mobile: "" });

  function add() {
    start(async () => {
      const r = await addLeadContactAction(leadId, { name: form.name, designation: form.designation, mobile: form.mobile });
      if (r.ok) {
        toast("Contact added");
        setForm({ name: "", designation: "", mobile: "" });
        setAdding(false);
        router.refresh();
      } else toast(r.error ?? "Failed to add contact", "error");
    });
  }

  function remove(id: string) {
    if (!confirm("Remove this contact?")) return;
    start(async () => {
      const r = await deleteLeadContactAction(leadId, id);
      if (r.ok) {
        toast("Contact removed");
        router.refresh();
      } else toast(r.error ?? "Failed to remove", "error");
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Contacts</CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {contacts.length === 0 && !adding && <span className="text-muted">No contacts yet — add the client-side people you deal with.</span>}

        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {c.name}
                {c.designation ? <span className="font-normal text-muted"> · {c.designation}</span> : ""}
              </div>
              <a href={`tel:${c.mobile}`} className="text-xs text-primary hover:underline">{c.mobile}</a>
            </div>
            <button onClick={() => remove(c.id)} disabled={pending} aria-label={`Remove ${c.name}`} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}

        {adding && (
          <div className="space-y-2 rounded-lg border border-border p-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Contact name" autoFocus />
            <Input placeholder="Designation (optional)" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} aria-label="Contact designation" />
            <Input placeholder="Mobile (10 digits)" inputMode="numeric" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })} aria-label="Contact mobile" />
            <div className="flex gap-2">
              <Button size="sm" onClick={add} loading={pending} disabled={!form.name || form.mobile.length < 10}>
                <Plus className="size-4" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
