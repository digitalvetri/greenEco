"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { LEAD_SOURCES } from "@/lib/constants";
import {
  updateClientAction,
  addClientContactAction,
  deleteClientContactAction,
} from "../actions";

type ClientContact = { id: string; name: string; designation: string | null; mobile: string };

export function ClientDetailsEditor({
  leadId,
  customerName,
  phone,
  email,
  address,
  source,
  contacts,
}: {
  leadId: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  contacts: ClientContact[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ customerName, phone, email, address, source });
  const [newContact, setNewContact] = useState({ name: "", designation: "", mobile: "" });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function saveDetails() {
    start(async () => {
      try {
        const res = await updateClientAction(leadId, {
          customerName: form.customerName,
          address: form.address,
          phone: form.phone,
          email: form.email || "",
          source: form.source,
        });
        if (res && "duplicate" in res && res.duplicate) {
          toast(`Another client already uses this phone (${res.duplicate.customerName})`, "error");
          return;
        }
        toast("Client details updated");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to save", "error");
      }
    });
  }

  function addContact() {
    if (!newContact.name.trim() || !newContact.mobile.trim()) {
      toast("Contact name and mobile are required", "error");
      return;
    }
    start(async () => {
      const res = await addClientContactAction(leadId, {
        name: newContact.name.trim(),
        designation: newContact.designation.trim() || undefined,
        mobile: newContact.mobile.trim(),
      });
      if (!res.ok) return toast(res.error, "error");
      toast("Contact added");
      setNewContact({ name: "", designation: "", mobile: "" });
      router.refresh();
    });
  }

  function removeContact(contactId: string) {
    start(async () => {
      const res = await deleteClientContactAction(leadId, contactId);
      if (!res.ok) return toast(res.error, "error");
      toast("Contact removed");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Edit
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Edit client details" className="max-w-lg">
        <div className="space-y-4">
          <div className="space-y-3">
            <Field label="Customer name" required>
              <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" required>
                <Input
                  value={form.phone}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Address" required>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Source" required>
              <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button size="sm" loading={pending} onClick={saveDetails}>
                Save details
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 text-sm font-semibold">Contacts</div>
            <div className="space-y-1.5">
              {contacts.length === 0 && <p className="text-xs text-muted">No contacts yet.</p>}
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.designation && <span className="text-muted"> · {c.designation}</span>}
                    <span className="text-muted"> · {c.mobile}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => removeContact(c.id)}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input
                placeholder="Name"
                value={newContact.name}
                onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))}
              />
              <Input
                placeholder="Designation"
                value={newContact.designation}
                onChange={(e) => setNewContact((c) => ({ ...c, designation: e.target.value }))}
              />
              <Input
                placeholder="Mobile"
                value={newContact.mobile}
                onChange={(e) => setNewContact((c) => ({ ...c, mobile: e.target.value.replace(/\D/g, "") }))}
              />
              <Button type="button" size="sm" variant="subtle" loading={pending} onClick={addContact}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
