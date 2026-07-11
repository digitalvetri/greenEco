"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Send, ClipboardList, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  transferAction,
  consumeAction,
  materialRequestAction,
  setRequestStatusAction,
  stockAuditAction,
} from "./actions";

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

type ToolKey = "transfer" | "consume" | "requests" | "audit";

export function MaterialsTools({
  items,
  locations,
  siteLocations,
  orders,
  requests,
}: {
  items: Opt[];
  locations: (Opt & { type: string })[];
  siteLocations: Opt[];
  orders: OrderOpt[];
  requests: RequestView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<ToolKey>("transfer");

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

  // ---- Transfer state ----
  const [transfer, setTransfer] = useState({ itemId: "", qty: "1", fromLocationId: "", toLocationId: "", note: "" });
  const transferValid =
    !!transfer.itemId &&
    Number(transfer.qty) > 0 &&
    !!transfer.fromLocationId &&
    !!transfer.toLocationId &&
    transfer.fromLocationId !== transfer.toLocationId;

  // ---- Consume state ----
  const [consume, setConsume] = useState({ itemId: "", qty: "1", fromLocationId: "", note: "" });
  const consumeValid = !!consume.itemId && Number(consume.qty) > 0 && !!consume.fromLocationId;

  // ---- Material request state ----
  const [reqOrderId, setReqOrderId] = useState("");
  const [reqLines, setReqLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: "", qty: "1" }]);
  const reqPayload = reqLines
    .filter((l) => l.itemId && Number(l.qty) > 0)
    .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }));
  const reqValid = !!reqOrderId && reqPayload.length > 0;
  const setReqLine = (idx: number, patch: Partial<{ itemId: string; qty: string }>) =>
    setReqLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  // ---- Stock audit state ----
  const [auditLocationId, setAuditLocationId] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const auditPayload = Object.entries(counts)
    .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
    .map(([itemId, v]) => ({ itemId, countedQty: Number(v) }));
  const auditValid = !!auditLocationId && auditPayload.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Operations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          items={[
            { key: "transfer", label: "Transfer" },
            { key: "consume", label: "Issue to Site" },
            { key: "requests", label: "Requests", count: requests.length || undefined },
            { key: "audit", label: "Audit" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as ToolKey)}
        />

        {/* ---------------- Transfer ---------------- */}
        {tab === "transfer" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Move stock between locations. Posts a paired transfer movement.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Item" required>
                <Select value={transfer.itemId} onChange={(e) => setTransfer({ ...transfer, itemId: e.target.value })}>
                  <option value="">Item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min="0" step="0.001" inputMode="decimal" value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })} />
              </Field>
              <Field label="From location" required>
                <Select value={transfer.fromLocationId} onChange={(e) => setTransfer({ ...transfer, fromLocationId: e.target.value })}>
                  <option value="">From…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="To location" required error={transfer.fromLocationId && transfer.fromLocationId === transfer.toLocationId ? "Pick a different location" : undefined}>
                <Select value={transfer.toLocationId} onChange={(e) => setTransfer({ ...transfer, toLocationId: e.target.value })}>
                  <option value="">To…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Note (optional)">
              <Input placeholder="Reason / reference" value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} />
            </Field>
            <Button
              size="sm"
              loading={busy === "transfer"}
              disabled={pending || !transferValid}
              onClick={() =>
                run(
                  "transfer",
                  () =>
                    transferAction({
                      itemId: transfer.itemId,
                      qty: Number(transfer.qty),
                      fromLocationId: transfer.fromLocationId,
                      toLocationId: transfer.toLocationId,
                      note: transfer.note || undefined,
                    }),
                  "Stock transferred.",
                )
              }
            >
              <ArrowLeftRight className="size-4" /> Move stock
            </Button>
          </div>
        )}

        {/* ---------------- Consume ---------------- */}
        {tab === "consume" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Issue material to a site — records consumption against erection actuals.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Item" required>
                <Select value={consume.itemId} onChange={(e) => setConsume({ ...consume, itemId: e.target.value })}>
                  <option value="">Item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min="0" step="0.001" inputMode="decimal" value={consume.qty} onChange={(e) => setConsume({ ...consume, qty: e.target.value })} />
              </Field>
              <Field label="From site" required hint={siteLocations.length === 0 ? "No site locations yet" : undefined}>
                <Select value={consume.fromLocationId} onChange={(e) => setConsume({ ...consume, fromLocationId: e.target.value })}>
                  <option value="">Site…</option>
                  {siteLocations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Note (optional)">
              <Input placeholder="What it was used for" value={consume.note} onChange={(e) => setConsume({ ...consume, note: e.target.value })} />
            </Field>
            <Button
              size="sm"
              loading={busy === "consume"}
              disabled={pending || !consumeValid}
              onClick={() =>
                run(
                  "consume",
                  () =>
                    consumeAction({
                      itemId: consume.itemId,
                      qty: Number(consume.qty),
                      fromLocationId: consume.fromLocationId,
                      note: consume.note || undefined,
                    }),
                  "Material issued to site.",
                )
              }
            >
              <Send className="size-4" /> Issue to site
            </Button>
          </div>
        )}

        {/* ---------------- Material requests ---------------- */}
        {tab === "requests" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted">Raise a material request for a project (no prices).</p>
              <Field label="Project" required>
                <Select value={reqOrderId} onChange={(e) => setReqOrderId(e.target.value)}>
                  <option value="">Project…</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNo} — {o.clientName}</option>
                  ))}
                </Select>
              </Field>
              <div className="space-y-2">
                {reqLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_auto] items-end gap-2">
                    <Field label={idx === 0 ? "Item" : undefined}>
                      <Select aria-label={`Item for line ${idx + 1}`} value={line.itemId} onChange={(e) => setReqLine(idx, { itemId: e.target.value })}>
                        <option value="">Item…</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={idx === 0 ? "Qty" : undefined}>
                      <Input aria-label={`Quantity for line ${idx + 1}`} type="number" min="0" step="0.001" inputMode="decimal" value={line.qty} onChange={(e) => setReqLine(idx, { qty: e.target.value })} />
                    </Field>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove line"
                      disabled={pending || reqLines.length === 1}
                      onClick={() => setReqLines((ls) => ls.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setReqLines((ls) => [...ls, { itemId: "", qty: "1" }])}>
                  <Plus className="size-4" /> Add line
                </Button>
                <Button
                  size="sm"
                  loading={busy === "request"}
                  disabled={pending || !reqValid}
                  onClick={() =>
                    run(
                      "request",
                      async () => {
                        await materialRequestAction(reqOrderId, reqPayload);
                        setReqLines([{ itemId: "", qty: "1" }]);
                        setReqOrderId("");
                      },
                      "Material request submitted.",
                    )
                  }
                >
                  <ClipboardList className="size-4" /> Submit request
                </Button>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Material requests</h4>
              {requests.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No material requests" description="Requests raised for projects will appear here." />
              ) : (
                <div className="space-y-2">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{r.orderNo}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span>
                          <Badge variant={r.status === "PENDING" ? "warn" : r.status === "REJECTED" ? "danger" : "ok"} dot>
                            {r.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {r.items.map((it) => `${itemName.get(it.itemId) ?? it.itemId} × ${it.qty}`).join(" · ")}
                      </div>
                      {r.status === "PENDING" && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(`req-t-${r.id}`, () => setRequestStatusAction(r.id, "TRANSFERRED"), "Marked transferred")}>
                            Mark transferred
                          </Button>
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(`req-c-${r.id}`, () => setRequestStatusAction(r.id, "CONVERTED_PO"), "Marked converted to PO")}>
                            Convert to PO
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(`req-r-${r.id}`, () => setRequestStatusAction(r.id, "REJECTED"), "Request rejected")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- Stock audit ---------------- */}
        {tab === "audit" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Count sheet for a location. Variances post ADJUST movements.</p>
            <Field label="Location" required>
              <Select
                value={auditLocationId}
                onChange={(e) => {
                  setAuditLocationId(e.target.value);
                  setCounts({});
                }}
              >
                <option value="">Location…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </Field>

            {auditLocationId && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="pb-2">Item</th>
                        <th className="pb-2 w-40 text-right">Counted qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id} className="border-t border-border">
                          <td className="py-1.5">
                            <label htmlFor={`count-${i.id}`}>{i.name}</label>
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <Input
                              id={`count-${i.id}`}
                              type="number"
                              min="0"
                              step="0.001"
                              inputMode="decimal"
                              className="h-8 text-right"
                              placeholder="—"
                              value={counts[i.id] ?? ""}
                              onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    loading={busy === "audit"}
                    disabled={pending || !auditValid}
                    onClick={() =>
                      run(
                        "audit",
                        async () => {
                          await stockAuditAction(auditLocationId, auditPayload);
                          setCounts({});
                        },
                        "Stock audit posted.",
                      )
                    }
                  >
                    <ClipboardCheck className="size-4" /> Post audit
                  </Button>
                  <span className="text-xs text-muted">{auditPayload.length} item(s) counted</span>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
