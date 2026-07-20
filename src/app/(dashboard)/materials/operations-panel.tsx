"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Send, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
              <ArrowLeftRight className="size-4 shrink-0 text-primary" />
              <span className="font-medium">Warehouse → Warehouse</span>
              <span className="text-muted">· Move stock between storage locations</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Item" required>
                <Select value={transfer.itemId} onChange={(e) => setTransfer({ ...transfer, itemId: e.target.value })}>
                  <option value="">Select item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min="0" step="0.001" inputMode="decimal" value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })} />
              </Field>
              <Field label="Source warehouse" required>
                <Select value={transfer.fromLocationId} onChange={(e) => setTransfer({ ...transfer, fromLocationId: e.target.value })}>
                  <option value="">Select source…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Destination warehouse"
                required
                error={transfer.fromLocationId && transfer.fromLocationId === transfer.toLocationId ? "Source and destination must be different" : undefined}
              >
                <Select value={transfer.toLocationId} onChange={(e) => setTransfer({ ...transfer, toLocationId: e.target.value })}>
                  <option value="">Select destination…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Note (optional)">
              <Input placeholder="Reason or reference number" value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} />
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
                  "Stock transferred successfully.",
                )
              }
            >
              <ArrowLeftRight className="size-4" /> Transfer stock
            </Button>
          </div>
        )}

        {tab === "consume" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
              <Send className="size-4 shrink-0 text-primary" />
              <span className="font-medium">Issue to Project Site</span>
              <span className="text-muted">· Records material used at the site (stock already delivered there)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Item" required>
                <Select value={consume.itemId} onChange={(e) => setConsume({ ...consume, itemId: e.target.value })}>
                  <option value="">Select item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min="0" step="0.001" inputMode="decimal" value={consume.qty} onChange={(e) => setConsume({ ...consume, qty: e.target.value })} />
              </Field>
              <Field label="Project / site" required hint={siteLocations.length === 0 ? "No site locations yet — create a project first" : undefined}>
                <Select value={consume.fromLocationId} onChange={(e) => setConsume({ ...consume, fromLocationId: e.target.value })}>
                  <option value="">Select project site…</option>
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
                  "Material issued to site successfully.",
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
                <Table>
                  <THead>
                    <TR className="border-t-0">
                      <TH>Item</TH>
                      <TH className="w-40 text-right">Counted qty</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {items.map((i) => (
                      <TR key={i.id}>
                        <TD>
                          <label htmlFor={`count-${i.id}`}>{i.name}</label>
                        </TD>
                        <TD className="text-right">
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
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
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
