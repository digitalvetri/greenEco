"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ITEM_CATEGORIES } from "@/lib/constants";
import { createItemAction } from "./actions";

/**
 * Add an item to the master. Collapsed by default — it's a rare setup job, so it
 * shouldn't push the daily stock list down the page (it used to sit above everything).
 */
export function AddItemCard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState({ name: "", category: "Plumbing", unit: "nos", reorderLevel: "0", purchasePrice: "" });

  const submit = () => {
    setBusy(true);
    start(async () => {
      try {
        await createItemAction({
          ...item,
          reorderLevel: Number(item.reorderLevel),
          purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : undefined,
        });
        toast("Item added");
        setItem({ name: "", category: "Plumbing", unit: "nos", reorderLevel: "0", purchasePrice: "" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong", "error");
      } finally {
        setBusy(false);
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add item
      </Button>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Add item</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Name" required>
          <Input placeholder="e.g. UPVC Pipe 110mm" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </Field>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Category">
            <Select value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })}>
              {ITEM_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Input placeholder="nos / m / cum" value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} />
          </Field>
          <Field label="Reorder level" hint="Below this = low stock">
            <Input type="number" min="0" inputMode="decimal" value={item.reorderLevel} onChange={(e) => setItem({ ...item, reorderLevel: e.target.value })} />
          </Field>
          <Field label="Purchase price ₹" hint="Admin-only; hidden from field staff.">
            <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" value={item.purchasePrice} onChange={(e) => setItem({ ...item, purchasePrice: e.target.value })} />
          </Field>
        </div>
        <Button size="sm" loading={busy} disabled={pending || !item.name} onClick={submit}>
          <Plus className="size-4" /> Add item
        </Button>
      </CardContent>
    </Card>
  );
}
