"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Store, User, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ITEM_CATEGORIES, categoryLabel } from "@/lib/constants";
import { createVendorAction, deleteVendorAction } from "./actions";

export type VendorRow = {
  id: string;
  name: string;
  phone: string;
  contact: string | null;
  address: string | null;
  gstin: string | null;
  categories: string[];
};

export function VendorsSection({
  vendors,
  activeCategory,
}: {
  vendors: VendorRow[];
  activeCategory?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", categories: "PumpsMotors", gstin: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const groups = (activeCategory ? [activeCategory] : [...ITEM_CATEGORIES]).map((cat) => ({
    key: cat,
    label: categoryLabel(cat),
    vendors: vendors.filter((v) => v.categories.includes(cat)),
  }));

  const uncategorized = activeCategory
    ? []
    : vendors.filter((v) => !v.categories.some((c) => (ITEM_CATEGORIES as readonly string[]).includes(c)));

  const anyShown = groups.some((g) => g.vendors.length > 0) || uncategorized.length > 0;

  function addVendor() {
    if (!form.name || !form.phone) return;
    start(async () => {
      try {
        await createVendorAction({ name: form.name, phone: form.phone, categories: [form.categories], gstin: form.gstin || undefined });
        toast("Vendor added");
        setForm({ name: "", phone: "", categories: "PumpsMotors", gstin: "" });
        setShowForm(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to add vendor", "error");
      }
    });
  }

  function removeVendor(id: string, name: string) {
    if (!confirm(`Remove vendor "${name}"?`)) return;
    setBusy(id);
    start(async () => {
      try {
        await deleteVendorAction(id);
        toast("Vendor removed");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Cannot delete — vendor has purchase orders", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <Store className="size-3.5" /> Vendors
            {vendors.length > 0 && <span className="font-normal text-muted">({vendors.length})</span>}
          </span>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" /> {showForm ? "Cancel" : "Add vendor"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <Field label="Vendor name" required>
              <Input placeholder="Vendor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="Phone" required>
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="GSTIN">
                <Input placeholder="Optional" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
              </Field>
            </div>
            <Button size="sm" loading={pending} disabled={!form.name || !form.phone} onClick={addVendor}>
              <Plus className="size-4" /> Save vendor
            </Button>
          </div>
        )}

        {vendors.length === 0 ? (
          <EmptyState icon={Store} title="No vendors yet" description="Add vendors to start raising purchase orders." />
        ) : !anyShown ? (
          <p className="py-4 text-center text-sm text-muted">No vendors for this category yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) =>
              g.vendors.length === 0 ? null : (
                <div key={g.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
                    <span className="text-[11px] text-muted">({g.vendors.length})</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.vendors.map((v) => (
                      <VendorCard key={v.id} v={v} onDelete={removeVendor} deleting={busy === v.id} />
                    ))}
                  </div>
                </div>
              ),
            )}
            {uncategorized.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Other</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {uncategorized.map((v) => (
                    <VendorCard key={v.id} v={v} onDelete={removeVendor} deleting={busy === v.id} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendorCard({
  v,
  onDelete,
  deleting,
}: {
  v: VendorRow;
  onDelete: (id: string, name: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{v.name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {v.gstin && <Badge variant="default">GST</Badge>}
          <button
            type="button"
            onClick={() => onDelete(v.id, v.name)}
            disabled={deleting}
            aria-label={`Delete vendor ${v.name}`}
            className="rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted">
        {v.contact && (
          <div className="flex items-center gap-1">
            <User className="size-3 shrink-0" /> {v.contact}
          </div>
        )}
        <div>
          <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
            <Phone className="size-3 shrink-0" /> {v.phone}
          </a>
        </div>
        {v.gstin && (
          <div className="font-mono text-[10px] text-muted/80">{v.gstin}</div>
        )}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {v.categories.map((c) => (
            <span key={c} className="rounded-full bg-card px-1.5 py-0.5 text-[10px] ring-1 ring-border">
              {categoryLabel(c)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
