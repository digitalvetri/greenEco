"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Field, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { SpeakButton } from "@/components/mobile/speak-button";
import { formatINR } from "@/lib/money";
import { PLANT_TYPES, TECHNOLOGIES, BOQ_CATEGORIES, LOST_REASONS } from "@/lib/constants";
import { ProposalTimeline } from "./proposal-timeline";
import { ProposalDocumentsCard } from "./proposal-documents-card";
import { SendProposalButtons } from "./send-proposal-button";
import type { ProposalEvent } from "@/server/services/proposal";
import {
  updateBasicsAction,
  saveVersionAction,
  generateAction,
  approveSendAction,
  wonAction,
  lostAction,
  setProposalStatusAction,
} from "../actions";

interface BoqRow {
  id?: string;
  category: string;
  item: string;
  specification?: string | null;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
  aiSuggested: boolean;
}

export interface ProposalView {
  id: string;
  number: string;
  status: string;
  projectName: string;
  siteAddress: string;
  plantType: string;
  technology: string;
  capacityKLD: number;
  lostReason: string | null;
  order: { id: string; orderNo: string } | null;
  version: {
    versionNo: number;
    technicalText: string;
    aiGenerated: boolean;
    approved: boolean;
    subtotal: string;
    gstAmount: string;
    grandTotal: string;
    estimatedCost: string | null;
    validityDays: number;
    paymentTerms: Array<{ description: string; percent: number; trigger: string }>;
    boqItems: BoqRow[];
  } | null;
}

export function ProposalEditor({
  view,
  isAdmin,
  events,
  documents,
}: {
  view: ProposalView;
  isAdmin: boolean;
  events: ProposalEvent[];
  documents: { id: string; url: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"proposal" | "activity" | "documents">("proposal");
  const locked = view.status === "WON" || view.status === "LOST";
  const editable = !locked && (isAdmin || view.status === "DRAFT");

  const [basics, setBasics] = useState({
    projectName: view.projectName,
    siteAddress: view.siteAddress,
    plantType: view.plantType,
    technology: view.technology,
    capacityKLD: view.capacityKLD,
  });
  const [boq, setBoq] = useState<BoqRow[]>(view.version?.boqItems ?? []);
  const [aiDesc, setAiDesc] = useState("");
  const [estCost, setEstCost] = useState(view.version?.estimatedCost ?? "");
  const [terms, setTerms] = useState(view.version?.paymentTerms ?? []);
  const [validity, setValidity] = useState(view.version?.validityDays ?? 30);
  const [marginWarn, setMarginWarn] = useState<null | { requiredFloor: string }>(null);
  const termsPct = terms.reduce((a, t) => a + (Number(t.percent) || 0), 0);

  const subtotal = boq.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const gst = Math.round(subtotal * 18) / 100;
  const grand = subtotal + gst;

  function run(fn: () => Promise<unknown>, ok?: string) {
    startTransition(async () => {
      try {
        await fn();
        if (ok) toast(ok);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "error");
      }
    });
  }

  function editRow(i: number, patch: Partial<BoqRow>) {
    setBoq((rows) =>
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch, aiSuggested: false };
        const qty = Number(next.qty) || 0;
        const rate = Number(next.rate) || 0;
        next.amount = (Math.round(qty * rate * 100) / 100).toString();
        return next;
      }),
    );
  }

  function saveBoq() {
    run(
      () =>
        saveVersionAction(view.id, {
          boqItems: boq.map((r) => ({
            category: r.category,
            item: r.item,
            specification: r.specification ?? undefined,
            unit: r.unit,
            qty: Number(r.qty),
            rate: Number(r.rate),
            amount: Number(r.amount),
            aiSuggested: r.aiSuggested,
          })),
          estimatedCost: isAdmin && estCost ? Number(estCost) : undefined,
          paymentTerms: terms,
          validityDays: Number(validity) || 30,
        }),
      "Saved.",
    );
  }

  const statusVariant =
    view.status === "WON" ? "ok" : view.status === "LOST" ? "danger" : "primary";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={view.projectName || "Proposal"}
        subtitle={view.number}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/print/proposal/${view.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              PDF
            </a>
            <Badge variant={statusVariant}>{view.status.replace(/_/g, " ")}</Badge>
            {view.order && (
              <Link href={`/projects/${view.order.id}`}>
                <Badge variant="ok">→ {view.order.orderNo}</Badge>
              </Link>
            )}
          </div>
        }
      />

      <Tabs
        className="mb-4"
        active={tab}
        onChange={(k) => setTab(k as "proposal" | "activity" | "documents")}
        items={[
          { key: "proposal", label: "Proposal" },
          { key: "activity", label: "Activity", count: events.length },
          { key: "documents", label: "Documents", count: documents.length },
        ]}
      />

      {tab === "activity" && <ProposalTimeline events={events} />}
      {tab === "documents" && <ProposalDocumentsCard proposalId={view.id} documents={documents} />}

      {tab === "proposal" && (
        <>
      {/* Basics */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Project name">
              <Input
                value={basics.projectName}
                disabled={!editable}
                onChange={(e) => setBasics({ ...basics, projectName: e.target.value })}
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Site address">
              <Input
                value={basics.siteAddress}
                disabled={!editable}
                onChange={(e) => setBasics({ ...basics, siteAddress: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Plant type">
            <Select
              value={basics.plantType}
              disabled={!editable}
              onChange={(e) => setBasics({ ...basics, plantType: e.target.value })}
            >
              {PLANT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Technology">
            <Select
              value={basics.technology}
              disabled={!editable}
              onChange={(e) => setBasics({ ...basics, technology: e.target.value })}
            >
              {TECHNOLOGIES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity (KLD)">
            <Input
              type="number"
              value={basics.capacityKLD}
              disabled={!editable}
              onChange={(e) => setBasics({ ...basics, capacityKLD: Number(e.target.value) })}
            />
          </Field>
          {editable && (
            <div className="col-span-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => updateBasicsAction(view.id, basics), "Basics saved.")}
              >
                Save basics
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI generate */}
      {editable && (
        <Card className="mb-4 border-primary/30">
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Sparkles className="size-4" /> AI Generate (draft — review before sending)
              </span>
              <SpeakButton onTranscript={(t) => setAiDesc(t)} />
            </div>
            <Textarea
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              placeholder="Describe the requirement (or Speak). e.g. STP 40 KLD for a 120-flat apartment, MBBR, reuse for gardening"
            />
            <Button
              variant="subtle"
              size="sm"
              disabled={pending || !aiDesc}
              onClick={() =>
                run(
                  () =>
                    generateAction(view.id, {
                      description: aiDesc,
                      capacityKLD: basics.capacityKLD || undefined,
                      technology: basics.technology,
                      plantType: basics.plantType,
                    }),
                  "AI draft generated. Review the orange rows.",
                )
              }
            >
              <Sparkles className="size-4" /> {pending ? "Generating…" : "Generate BOQ + write-up"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Technical write-up */}
      {view.version?.technicalText && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Technical Write-up {view.version.aiGenerated && "(AI)"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">
              {view.version.technicalText}
            </p>
          </CardContent>
        </Card>
      )}

      {/* BOQ */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Bill of Quantities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1">Item</th>
                  <th className="pb-1">Cat</th>
                  <th className="pb-1">Unit</th>
                  <th className="pb-1 text-right">Qty</th>
                  <th className="pb-1 text-right">Rate ₹</th>
                  <th className="pb-1 text-right">Amount</th>
                  {editable && <th></th>}
                </tr>
              </thead>
              <tbody>
                {boq.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1">
                        {r.aiSuggested && <Badge variant="review">review</Badge>}
                        {editable ? (
                          <Input
                            className="h-8"
                            value={r.item}
                            onChange={(e) => editRow(i, { item: e.target.value })}
                          />
                        ) : (
                          <span>{r.item}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-xs text-muted">
                      {editable ? (
                        <Select
                          className="h-8 w-24"
                          value={r.category}
                          onChange={(e) => editRow(i, { category: e.target.value })}
                        >
                          {BOQ_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      ) : (
                        r.category
                      )}
                    </td>
                    <td className="py-1 pr-2">{r.unit}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {editable ? (
                        <Input
                          className="h-8 w-16 text-right"
                          value={r.qty}
                          onChange={(e) => editRow(i, { qty: e.target.value })}
                        />
                      ) : (
                        r.qty
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {editable ? (
                        <Input
                          className="h-8 w-20 text-right"
                          value={r.rate}
                          onChange={(e) => editRow(i, { rate: e.target.value })}
                        />
                      ) : (
                        r.rate
                      )}
                    </td>
                    <td className="py-1 text-right font-medium tabular-nums">
                      {formatINR(r.amount || 0)}
                    </td>
                    {editable && (
                      <td className="py-1 pl-1">
                        <button onClick={() => setBoq(boq.filter((_, j) => j !== i))}>
                          <Trash2 className="size-4 text-danger" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() =>
                setBoq([
                  ...boq,
                  {
                    category: "Others",
                    item: "",
                    unit: "nos",
                    qty: "1",
                    rate: "0",
                    amount: "0",
                    aiSuggested: false,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          )}

          <div className="mt-3 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <Row label="GST @ 18%" value={formatINR(gst)} />
            <Row label="Grand Total" value={formatINR(grand)} bold />
            {isAdmin && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="mb-0">Est. cost (admin)</Label>
                <Input
                  className="h-8 w-32"
                  value={estCost}
                  disabled={!editable}
                  onChange={(e) => setEstCost(e.target.value)}
                  placeholder="margin guard"
                />
                {estCost && Number(estCost) > 0 && (
                  <span className="text-xs text-muted">
                    Margin {(((grand - Number(estCost)) / grand) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Payment terms — seed the order's milestones on Win, so they're editable here. */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Payment terms</span>
              <span className={`text-xs tabular-nums ${termsPct === 100 ? "text-ok" : "text-warn"}`}>
                {termsPct}% {termsPct === 100 ? "" : "(should total 100%)"}
              </span>
            </div>
            <div className="space-y-2">
              {terms.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_9rem_auto] gap-2">
                  <Input
                    placeholder="Milestone (e.g. Advance on order)"
                    value={t.description}
                    disabled={!editable}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  />
                  <Input
                    type="number"
                    aria-label="Percent"
                    value={t.percent}
                    disabled={!editable}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
                  />
                  <Select
                    value={t.trigger}
                    disabled={!editable}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, trigger: e.target.value } : x)))}
                  >
                    <option value="DATE">On advance / date</option>
                    <option value="STAGE_COMPLETION">On stage completion</option>
                  </Select>
                  {editable && (
                    <Button variant="ghost" size="icon" onClick={() => setTerms((ts) => ts.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
              ))}
              {editable && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setTerms((ts) => [...ts, { description: "", percent: 0, trigger: "STAGE_COMPLETION" }])}
                >
                  <Plus className="size-4" /> Add milestone
                </Button>
              )}
            </div>
            <div className="mt-3 max-w-[10rem]">
              <Field label="Validity (days)">
                <Input type="number" value={validity} disabled={!editable} onChange={(e) => setValidity(Number(e.target.value))} />
              </Field>
            </div>
          </div>

          {editable && (
            <Button className="mt-3" disabled={pending} onClick={saveBoq}>
              {pending ? "Saving…" : "Save proposal"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {isAdmin && !locked && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-4">
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await approveSendAction(view.id);
                  if (res && "marginWarning" in res && res.marginWarning) {
                    setMarginWarn({ requiredFloor: res.marginWarning.requiredFloor });
                  } else {
                    toast("Approved & marked SENT.");
                  }
                })
              }
            >
              <Check className="size-4" /> Approve & Send
            </Button>
            {view.status !== "DRAFT" && view.version?.approved && (
              <Button
                variant="subtle"
                disabled={pending}
                onClick={() => run(() => wonAction(view.id), "Won — order created.")}
              >
                Mark Won → create Order
              </Button>
            )}
            {view.status === "SENT" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => setProposalStatusAction(view.id, "UNDER_NEGOTIATION"), "Moved to negotiation.")}
              >
                Mark under negotiation
              </Button>
            )}
            {view.status === "UNDER_NEGOTIATION" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => setProposalStatusAction(view.id, "SENT"), "Back to sent.")}
              >
                Back to sent
              </Button>
            )}
            {(view.status === "SENT" || view.status === "UNDER_NEGOTIATION") && (
              <SendProposalButtons proposalId={view.id} />
            )}
            <MarkLostButton id={view.id} run={run} />
          </CardContent>
        </Card>
      )}

      {/* Reopen a lost proposal (the actions card is hidden once locked). */}
      {isAdmin && view.status === "LOST" && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <span className="text-sm text-danger">Lost: {view.lostReason}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setProposalStatusAction(view.id, "SENT"), "Reopened.")}
          >
            Reopen
          </Button>
        </div>
      )}
      {view.lostReason && view.status !== "LOST" && (
        <p className="mt-3 text-sm text-muted">Previously lost: {view.lostReason}</p>
      )}
        </>
      )}

      {marginWarn && (
        <MarginModal
          floor={marginWarn.requiredFloor}
          onClose={() => setMarginWarn(null)}
          onConfirm={(note) => {
            setMarginWarn(null);
            run(() => approveSendAction(view.id, note), "Approved with margin override.");
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-bold" : "text-muted")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function MarkLostButton({
  id,
  run,
}: {
  id: string;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Mark Lost
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mark proposal as lost">
        <div className="space-y-3">
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select a reason…</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any detail worth recording…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!reason}
              onClick={() => {
                setOpen(false);
                run(() => lostAction(id, note.trim() ? `${reason} — ${note.trim()}` : reason), "Marked lost.");
              }}
            >
              Mark lost
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function MarginModal({
  floor,
  onClose,
  onConfirm,
}: {
  floor: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-w-sm">
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2 text-warn">
            <AlertTriangle className="size-5" />
            <span className="font-semibold">Below margin floor</span>
          </div>
          <p className="text-sm">
            Grand total is below the minimum margin floor of {formatINR(floor)}. A note is required
            to approve.
          </p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for low margin" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={!note} onClick={() => onConfirm(note)}>
              Approve anyway
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
