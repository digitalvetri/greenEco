"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, PackageCheck, Send, ShoppingCart } from "lucide-react";
// Vendors are shown in VendorsSection above this panel — no duplicate card here.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { ExportButton } from "@/components/ui/export-button";
import { formatINR } from "@/lib/money";
import { createPOAction, setPOStatusAction, receiveGRNAction } from "./actions";

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

/**
 * Purchasing — buy material: vendors, raise a PO, then receive it (GRN → stock).
 * Admin-only; POs carry purchase rates.
 */
export function PurchasingPanel({
  items,
  vendors,
  locations,
  pos,
}: {
  items: Opt[];
  vendors: Opt[];
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

  const [po, setPo] = useState({ vendorId: "", destinationId: "", itemId: "", qty: "1", rate: "0" });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Raise a purchase order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {vendors.length === 0 ? (
            <p className="text-sm text-muted">Add a vendor first — a PO needs someone to buy from.</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Vendor" required>
                  <Select value={po.vendorId} onChange={(e) => setPo({ ...po, vendorId: e.target.value })}>
                    <option value="">Vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deliver to" required>
                  <Select value={po.destinationId} onChange={(e) => setPo({ ...po, destinationId: e.target.value })}>
                    <option value="">Destination…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Item" required>
                  <Select value={po.itemId} onChange={(e) => setPo({ ...po, itemId: e.target.value })}>
                    <option value="">Item…</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Qty" required>
                  <Input type="number" min="0" step="0.001" inputMode="decimal" value={po.qty} onChange={(e) => setPo({ ...po, qty: e.target.value })} />
                </Field>
                <Field label="Rate ₹" required>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={po.rate} onChange={(e) => setPo({ ...po, rate: e.target.value })} />
                </Field>
              </div>
              <Button
                size="sm"
                loading={busy === "po"}
                disabled={pending || !po.vendorId || !po.destinationId || !po.itemId}
                onClick={() =>
                  run(
                    "po",
                    async () => {
                      await createPOAction({
                        vendorId: po.vendorId,
                        destinationId: po.destinationId,
                        expectedDate: new Date(Date.now() + 7 * 86400000),
                        items: [{ itemId: po.itemId, qty: Number(po.qty), rate: Number(po.rate) }],
                      });
                      setPo({ vendorId: "", destinationId: "", itemId: "", qty: "1", rate: "0" });
                    },
                    "PO raised",
                  )
                }
              >
                <Plus className="size-4" /> Raise PO
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Purchase orders {pos.length > 0 && <span className="text-muted">({pos.length})</span>}</CardTitle>
          {pos.length > 0 && (
            <ExportButton
              rows={pos.map((p) => ({ "PO No": p.poNo, Vendor: p.vendor, Status: p.status, "Total ₹": p.totalValue }))}
              filename="purchase-orders"
              label="Export POs"
            />
          )}
        </CardHeader>
        <CardContent>
          {pos.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No purchase orders" description="Raise one above to start buying material." />
          ) : (
            <div className="space-y-1">
              {pos.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0">
                  <div className="min-w-0">
                    <span className="font-mono text-xs">{p.poNo}</span> · <span className="truncate">{p.vendor}</span>
                    <div className="text-xs text-muted">{formatINR(p.totalValue)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={p.status === "RECEIVED" ? "ok" : p.status === "DRAFT" ? "default" : "primary"}>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                    {p.status === "DRAFT" && (
                      <Button size="sm" variant="outline" loading={busy === `send-${p.id}`} disabled={pending} onClick={() => run(`send-${p.id}`, () => setPOStatusAction(p.id, "SENT"), "PO sent")}>
                        <Send className="size-3.5" /> Send
                      </Button>
                    )}
                    {!p.received && p.status !== "RECEIVED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === `grn-${p.id}`}
                        disabled={pending}
                        onClick={() => run(`grn-${p.id}`, () => receiveGRNAction(p.id, p.items.map((it) => ({ itemId: it.itemId, receivedQty: it.qty }))), "GRN received → stock posted")}
                      >
                        <PackageCheck className="size-3.5" /> Receive all
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
