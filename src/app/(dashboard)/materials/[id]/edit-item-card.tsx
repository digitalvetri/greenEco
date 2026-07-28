"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ITEM_CATEGORIES, categoryLabel } from "@/lib/constants";
import { updateItemAction } from "../actions";

export function EditItemCard({
  itemId,
  isAdmin,
  item,
}: {
  itemId: string;
  isAdmin: boolean;
  item: {
    category: string;
    unit: string;
    specification: string | null;
    reorderLevel: string;
    purchasePrice: string | null;
    catalogFreight: string | null;
    catalogLoadingCharges: string | null;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    category: item.category,
    unit: item.unit,
    specification: item.specification ?? "",
    reorderLevel: item.reorderLevel,
    purchasePrice: item.purchasePrice ?? "",
    catalogFreight: item.catalogFreight ?? "",
    catalogLoadingCharges: item.catalogLoadingCharges ?? "",
  });

  if (!isAdmin) return null;

  function save() {
    start(async () => {
      try {
        await updateItemAction(itemId, {
          category: f.category,
          unit: f.unit,
          specification: f.specification || undefined,
          reorderLevel: Number(f.reorderLevel),
          purchasePrice: f.purchasePrice === "" ? null : Number(f.purchasePrice),
          catalogFreight: f.catalogFreight === "" ? null : Number(f.catalogFreight),
          catalogLoadingCharges: f.catalogLoadingCharges === "" ? null : Number(f.catalogLoadingCharges),
        });
        toast("Item updated");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update item", "error");
      }
    });
  }

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" /> Edit item
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Edit item</CardTitle>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel edit" className="rounded p-1 text-muted hover:bg-card">
          <X className="size-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
              {!(ITEM_CATEGORIES as readonly string[]).includes(f.category) && (
                <option value={f.category}>{f.category}</option>
              )}
            </Select>
          </Field>
          <Field label="Unit">
            <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="nos / m / kg / bag" />
          </Field>
        </div>
        <Field label="Specification">
          <Textarea value={f.specification} onChange={(e) => setF({ ...f, specification: e.target.value })} placeholder="Optional" />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Reorder level">
            <Input type="number" min="0" step="0.001" inputMode="decimal" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} />
          </Field>
          <Field label="Purchase price ₹" hint="Admin-only — never shown to employees.">
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Catalog freight ₹" hint="As per the vendor's price list — reference only, actual PO freight may differ.">
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.catalogFreight} onChange={(e) => setF({ ...f, catalogFreight: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Catalog loading/unloading ₹" hint="As per the vendor's price list — reference only.">
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.catalogLoadingCharges} onChange={(e) => setF({ ...f, catalogLoadingCharges: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        <Button size="sm" loading={pending} onClick={save}>Save changes</Button>
      </CardContent>
    </Card>
  );
}
