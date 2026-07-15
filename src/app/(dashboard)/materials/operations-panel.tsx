"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Send, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { transferAction, consumeAction, stockAuditAction } from "./actions";

interface Opt {
  id: string;
  name: string;
}

type ToolKey = "transfer" | "consume" | "audit";

/**
 * Stock operations — the daily "move material" jobs. Split out of the old
 * `MaterialsTools`, which buried these below a 100-row PO list at the bottom of a
 * ~3-screen page. Requests moved to their own route (employees need them; these are admin).
 */
export function OperationsPanel({
  items,
  locations,
  siteLocations,
}: {
  items: Opt[];
  locations: Opt[];
  siteLocations: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<ToolKey>("transfer");

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

  const [transfer, setTransfer] = useState({ itemId: "", qty: "1", fromLocationId: "", toLocationId: "", note: "" });
  const transferValid =
    !!transfer.itemId &&
    Number(transfer.qty) > 0 &&
    !!transfer.fromLocationId &&
    !!transfer.toLocationId &&
    transfer.fromLocationId !== transfer.toLocationId;

  const [consume, setConsume] = useState({ itemId: "", qty: "1", fromLocationId: "", note: "" });
  const consumeValid = !!consume.itemId && Number(consume.qty) > 0 && !!consume.fromLocationId;

  const [auditLocationId, setAuditLocationId] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const auditPayload = Object.entries(counts)
    .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
    .map(([itemId, v]) => ({ itemId, countedQty: Number(v) }));
  const auditValid = !!auditLocationId && auditPayload.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <Tabs
          items={[
            { key: "transfer", label: "Transfer" },
            { key: "consume", label: "Issue to Site" },
            { key: "audit", label: "Stock Audit" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as ToolKey)}
        />

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
              <Field
                label="To location"
                required
                error={transfer.fromLocationId && transfer.fromLocationId === transfer.toLocationId ? "Pick a different location" : undefined}
              >
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
                        <th className="w-40 pb-2 text-right">Counted qty</th>
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
