"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, PackageCheck, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ExportButton } from "@/components/ui/export-button";
import { formatINR } from "@/lib/money";
import { ITEM_CATEGORIES } from "@/lib/constants";
import {
  createItemAction,
  createVendorAction,
  createPOAction,
  setPOStatusAction,
  receiveGRNAction,
} from "./actions";

interface Opt {
  id: string;
  name: string;
}
interface POView {
  id: string;
  poNo: string;
  vendor: string;
  status: string;
  totalValue: string;
  items: { itemId: string; qty: number; rate: number }[];
  received: boolean;
}

export function MaterialsAdmin({
  items,
  vendors,
  locations,
  pos,
}: {
  items: Opt[];
  vendors: (Opt & { categories: string[] })[];
  locations: Opt[];
  pos: POView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    start(async () => {
      try {
        await fn();
        toast(ok);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong", "error");
      } finally {
        setBusy(null);
      }
    });
  };

  const [item, setItem] = useState({ name: "", category: "Plumbing", unit: "nos", reorderLevel: "0", purchasePrice: "" });
  const [vendor, setVendor] = useState({ name: "", phone: "", categories: "PumpsMotors", gstin: "" });
  const [po, setPo] = useState({ vendorId: "", destinationId: "", itemId: "", qty: "1", rate: "0" });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Add item */}
        <Card>
          <CardHeader>
            <CardTitle>Add Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Field label="Name">
              <Input placeholder="e.g. UPVC Pipe 110mm" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
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
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Reorder level">
                <Input placeholder="0" value={item.reorderLevel} onChange={(e) => setItem({ ...item, reorderLevel: e.target.value })} />
              </Field>
              <Field label="Purchase price ₹" hint="Admin-only; hidden from field staff.">
                <Input placeholder="0" value={item.purchasePrice} onChange={(e) => setItem({ ...item, purchasePrice: e.target.value })} />
              </Field>
            </div>
            <Button size="sm" loading={busy === "item"} disabled={pending || !item.name} onClick={() => run("item", () => createItemAction({ ...item, reorderLevel: Number(item.reorderLevel), purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : undefined }), "Item added")}>
              <Plus className="size-4" /> Add item
            </Button>
          </CardContent>
        </Card>

        {/* Add vendor */}
        <Card>
          <CardHeader>
            <CardTitle>Add Vendor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Field label="Name">
              <Input placeholder="Vendor name" value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone">
                <Input placeholder="Phone" value={vendor.phone} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={vendor.categories} onChange={(e) => setVendor({ ...vendor, categories: e.target.value })}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="GSTIN">
              <Input placeholder="GSTIN (optional)" value={vendor.gstin} onChange={(e) => setVendor({ ...vendor, gstin: e.target.value })} />
            </Field>
            <Button size="sm" loading={busy === "vendor"} disabled={pending || !vendor.name || !vendor.phone} onClick={() => run("vendor", () => createVendorAction({ name: vendor.name, phone: vendor.phone, categories: [vendor.categories], gstin: vendor.gstin || undefined }), "Vendor added")}>
              <Plus className="size-4" /> Add vendor
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Create PO */}
      <Card>
        <CardHeader>
          <CardTitle>Raise Purchase Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vendor">
              <Select value={po.vendorId} onChange={(e) => setPo({ ...po, vendorId: e.target.value })}>
                <option value="">Vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Destination">
              <Select value={po.destinationId} onChange={(e) => setPo({ ...po, destinationId: e.target.value })}>
                <option value="">Destination…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Item">
              <Select value={po.itemId} onChange={(e) => setPo({ ...po, itemId: e.target.value })}>
                <option value="">Item…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input placeholder="1" value={po.qty} onChange={(e) => setPo({ ...po, qty: e.target.value })} />
            </Field>
            <Field label="Rate ₹">
              <Input placeholder="0" value={po.rate} onChange={(e) => setPo({ ...po, rate: e.target.value })} />
            </Field>
          </div>
          <Button size="sm" loading={busy === "po"} disabled={pending || !po.vendorId || !po.destinationId || !po.itemId} onClick={() => run("po", () => createPOAction({ vendorId: po.vendorId, destinationId: po.destinationId, expectedDate: new Date(Date.now() + 7 * 86400000), items: [{ itemId: po.itemId, qty: Number(po.qty), rate: Number(po.rate) }] }), "PO raised")}>
            <Plus className="size-4" /> Raise PO
          </Button>
        </CardContent>
      </Card>

      {/* PO list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Purchase Orders</CardTitle>
          <ExportButton
            rows={pos.map((p) => ({ "PO No": p.poNo, Vendor: p.vendor, Status: p.status, "Total ₹": p.totalValue }))}
            filename="purchase-orders"
            label="Export POs"
          />
        </CardHeader>
        <CardContent className="space-y-2">
          {pos.length === 0 && <p className="text-sm text-muted">No purchase orders.</p>}
          {pos.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
              <div>
                <span className="font-mono text-xs">{p.poNo}</span> · {p.vendor}
                <div className="text-xs text-muted">{formatINR(p.totalValue)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.status === "RECEIVED" ? "ok" : p.status === "DRAFT" ? "default" : "primary"}>{p.status.replace(/_/g, " ")}</Badge>
                {p.status === "DRAFT" && (
                  <Button size="sm" variant="outline" loading={busy === `send-${p.id}`} disabled={pending} onClick={() => run(`send-${p.id}`, () => setPOStatusAction(p.id, "SENT"), "PO sent")}>
                    <Send className="size-3.5" /> Send
                  </Button>
                )}
                {!p.received && p.status !== "RECEIVED" && (
                  <Button size="sm" variant="outline" loading={busy === `grn-${p.id}`} disabled={pending} onClick={() => run(`grn-${p.id}`, () => receiveGRNAction(p.id, p.items.map((it) => ({ itemId: it.itemId, receivedQty: it.qty }))), "GRN received → stock posted")}>
                    <PackageCheck className="size-3.5" /> Receive all
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
