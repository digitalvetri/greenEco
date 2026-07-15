"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { materialRequestAction, setRequestStatusAction } from "./actions";

interface Opt {
  id: string;
  name: string;
}
interface OrderOpt {
  id: string;
  orderNo: string;
  clientName: string;
}
interface RequestView {
  id: string;
  orderNo: string;
  status: string;
  createdAt: string;
  items: { itemId: string; qty: number }[];
}

/**
 * Material requests — the field-staff flow (deliberately carries NO prices).
 *
 * Previously this lived inside `MaterialsTools`, which the page only rendered under
 * `{isAdmin && …}` — so EMPLOYEEs could never reach the one flow built for them, even
 * though `createMaterialRequest` has no `requireAdmin`. It now has its own route.
 * Admins additionally get the approve/transfer/convert actions on each request.
 */
export function RequestsPanel({
  items,
  orders,
  requests,
  isAdmin,
}: {
  items: Opt[];
  orders: OrderOpt[];
  requests: RequestView[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

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

  const [orderId, setOrderId] = useState("");
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: "", qty: "1" }]);
  const payload = lines
    .filter((l) => l.itemId && Number(l.qty) > 0)
    .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }));
  const valid = !!orderId && payload.length > 0;
  const setLine = (idx: number, patch: Partial<{ itemId: string; qty: string }>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Raise a material request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            Ask for material against a project. No prices are involved — the office decides whether to transfer
            from stock or raise a purchase order.
          </p>

          {orders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No projects available"
              description="You can only request material against a project you're assigned to."
            />
          ) : (
            <>
              <Field label="Project" required>
                <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">Project…</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNo} — {o.clientName}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_auto] items-end gap-2">
                    <Field label={idx === 0 ? "Item" : undefined}>
                      <Select
                        aria-label={`Item for line ${idx + 1}`}
                        value={line.itemId}
                        onChange={(e) => setLine(idx, { itemId: e.target.value })}
                      >
                        <option value="">Item…</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={idx === 0 ? "Qty" : undefined}>
                      <Input
                        aria-label={`Quantity for line ${idx + 1}`}
                        type="number"
                        min="0"
                        step="0.001"
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => setLine(idx, { qty: e.target.value })}
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove line ${idx + 1}`}
                      disabled={pending || lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setLines((ls) => [...ls, { itemId: "", qty: "1" }])}
                >
                  <Plus className="size-4" /> Add line
                </Button>
                <Button
                  size="sm"
                  loading={busy === "request"}
                  disabled={pending || !valid}
                  onClick={() =>
                    run(
                      "request",
                      async () => {
                        await materialRequestAction(orderId, payload);
                        setLines([{ itemId: "", qty: "1" }]);
                        setOrderId("");
                      },
                      "Material request submitted.",
                    )
                  }
                >
                  <ClipboardList className="size-4" /> Submit request
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requests {requests.length > 0 && <span className="text-muted">({requests.length})</span>}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No material requests yet"
              description="Requests raised against projects will appear here."
            />
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{r.orderNo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        {new Date(r.createdAt).toLocaleDateString("en-IN")}
                      </span>
                      <Badge
                        variant={r.status === "PENDING" ? "warn" : r.status === "REJECTED" ? "danger" : "ok"}
                        dot
                      >
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {r.items.map((it) => `${itemName.get(it.itemId) ?? it.itemId} × ${it.qty}`).join(" · ")}
                  </div>
                  {isAdmin && r.status === "PENDING" && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === `req-t-${r.id}`}
                        disabled={pending}
                        onClick={() => run(`req-t-${r.id}`, () => setRequestStatusAction(r.id, "TRANSFERRED"), "Marked transferred")}
                      >
                        Mark transferred
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === `req-c-${r.id}`}
                        disabled={pending}
                        onClick={() => run(`req-c-${r.id}`, () => setRequestStatusAction(r.id, "CONVERTED_PO"), "Marked converted to PO")}
                      >
                        Convert to PO
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `req-r-${r.id}`}
                        disabled={pending}
                        onClick={() => run(`req-r-${r.id}`, () => setRequestStatusAction(r.id, "REJECTED"), "Request rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
