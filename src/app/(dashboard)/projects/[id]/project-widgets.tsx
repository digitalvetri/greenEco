"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Receipt as ReceiptIcon, CalendarClock, Plus, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Uploader } from "@/components/mobile/uploader";
import { DRAWING_DISCIPLINES } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { Decimal } from "decimal.js";
import { toast } from "@/components/ui/toast";
import { InvoicePanel } from "../../invoices/invoice-panel";
import {
  updateStageAction,
  addStagePhotoAction,
  addDrawingAction,
  addReceiptAction,
  addMilestoneAction,
  createInvoiceAction,
  setMilestoneScheduleAction,
} from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, done?: () => void) => {
    setErr(null);
    start(async () => {
      try {
        await fn();
        done?.();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    });
  };
  return { run, pending, err };
}

/** Overall stage progress — a thin bar + "N of M complete" summary above the timeline. */
export function StageProgressSummary({ stages }: { stages: { status: string }[] }) {
  const done = stages.filter((s) => s.status === "DONE").length;
  const pct = stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">
          {done} of {stages.length} stages complete
        </span>
        <span className="font-semibold text-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A stage in the execution timeline — vertical rail (matches ProjectTimeline's icon-rail
 * pattern) with a colored status marker, expandable to update status/notes/photos/delay. */
export function StageRow({
  orderId,
  stage,
  isLast,
}: {
  orderId: string;
  stage: { id: string; seq: number; name: string; status: string; plannedDate: string | null; actualDate: string | null; notes: string | null; delayReason: string | null; photos: { id: string; url: string }[] };
  isLast: boolean;
}) {
  const { run, pending, err } = useRun();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(stage.status);
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [delay, setDelay] = useState(stage.delayReason ?? "");
  const [planned, setPlanned] = useState(stage.plannedDate?.slice(0, 10) ?? "");

  const variant = stage.status === "DONE" ? "ok" : stage.status === "IN_PROGRESS" ? "primary" : "default";
  const overdue = stage.plannedDate && stage.status !== "DONE" && new Date(stage.plannedDate) < new Date();

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={
            "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
            (stage.status === "DONE"
              ? "border-ok bg-ok text-white"
              : stage.status === "IN_PROGRESS"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-muted")
          }
        >
          {stage.status === "DONE" ? (
            <CheckCircle2 className="size-4" />
          ) : stage.status === "IN_PROGRESS" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            stage.seq
          )}
        </span>
        {!isLast && <span className="my-0.5 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{stage.name}</span>
            <Badge variant={variant}>{stage.status.replace(/_/g, " ")}</Badge>
            {overdue && (
              <Badge variant="danger">
                <AlertTriangle className="size-3" /> overdue
              </Badge>
            )}
          </div>
          <button className="shrink-0 text-xs font-medium text-primary" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Update"}
          </button>
        </div>
        {(stage.plannedDate || stage.actualDate) && (
          <div className="mt-0.5 text-xs text-muted">
            {stage.plannedDate && <>Planned {new Date(stage.plannedDate).toLocaleDateString("en-IN")}</>}
            {stage.plannedDate && stage.actualDate && " · "}
            {stage.actualDate && <>Done {new Date(stage.actualDate).toLocaleDateString("en-IN")}</>}
          </div>
        )}
        {stage.photos.length > 0 && (
          <div className="mt-1.5 flex gap-1">
            {stage.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" className="size-10 rounded border border-border object-cover" />
            ))}
          </div>
        )}
        {open && (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-3">
            {err && <div className="text-xs text-danger">{err}</div>}
            <div className="grid grid-cols-2 gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stage status">
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="DONE">Done</option>
              </Select>
              <Uploader
                label="Photo"
                capture
                onUploaded={(files) => {
                  for (const f of files) {
                    navigator.geolocation?.getCurrentPosition(
                      (pos) => run(() => addStagePhotoAction(orderId, stage.id, { url: f.url, lat: pos.coords.latitude, lng: pos.coords.longitude })),
                      () => run(() => addStagePhotoAction(orderId, stage.id, { url: f.url })),
                    );
                  }
                }}
              />
            </div>
            <Field label="Planned date" hint="Enables the delay-reason gate once past.">
              <Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </Field>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Stage notes" className="min-h-14" />
            {overdue && (
              <Input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="Delay reason (required — past planned date)" aria-label="Delay reason" />
            )}
            <Button size="sm" disabled={pending} onClick={() => run(() => updateStageAction(orderId, stage.id, { status, notes, delayReason: delay || undefined, plannedDate: planned ? new Date(planned) : null }), () => setOpen(false))}>
              <Check className="size-4" /> Save
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function DrawingUpload({ orderId }: { orderId: string }) {
  const { run, pending, err } = useRun();
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("Structural");
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-3">
      {err && <div className="text-xs text-danger">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Drawing title (re-upload = new rev)" aria-label="Drawing title" />
        <Select value={discipline} onChange={(e) => setDiscipline(e.target.value)} aria-label="Drawing discipline">
          {DRAWING_DISCIPLINES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </div>
      <Uploader
        label="Upload drawing"
        accept=".dwg,.dxf,application/pdf,image/*"
        // Internal engineering document — stored behind a login (see api/files).
        scope="secure"
        // One drawing per upload. The default `multiple` uploaded every selected file
        // to storage but created a single Drawing row, silently orphaning the rest.
        multiple={false}
        compress={false}
        onUploaded={(files) => {
          // The title check has to happen BEFORE the picker opens, not here — by this
          // point the file is already in storage, so returning early orphans it.
          run(() => addDrawingAction(orderId, { title, discipline, fileUrl: files[0].url }), () => setTitle(""));
        }}
        disabled={!title.trim()}
      />
      {!title.trim() && <span className="text-xs text-muted">Enter a title first.</span>}
      {pending && <span className="text-xs text-muted">Uploading…</span>}
    </div>
  );
}

export function MilestoneRow({
  orderId,
  milestone,
  isAdmin,
  stages = [],
}: {
  orderId: string;
  milestone: {
    id: string;
    description: string;
    amount: string;
    status: string;
    received: string;
    invoiceNo: string | null;
    invoiceId: string | null;
    dueBasis: string;
    dueDate: string | null;
    linkedStageId: string | null;
  };
  isAdmin: boolean;
  stages?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { run, pending, err } = useRun();
  const [open, setOpen] = useState(false);
  const [sched, setSched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [panelInvoiceId, setPanelInvoiceId] = useState<string | null>(null);

  // Create the invoice, then slide the panel in to review + issue it (no new tab).
  async function createAndOpen() {
    setCreating(true);
    try {
      const res = await createInvoiceAction(orderId, milestone.id);
      if (res && "invoiceId" in res && res.invoiceId) {
        setPanelInvoiceId(res.invoiceId);
      }
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create invoice", "error");
    } finally {
      setCreating(false);
    }
  }
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("NEFT");
  const [due, setDue] = useState(milestone.dueDate?.slice(0, 10) ?? "");
  const [linked, setLinked] = useState(milestone.linkedStageId ?? "");
  const variant = milestone.status === "PAID" ? "ok" : milestone.status === "DUE" ? "warn" : milestone.status === "PARTIALLY_PAID" ? "primary" : "default";

  return (
    <div className="border-t border-border py-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{milestone.description}</div>
          {milestone.status === "PARTIALLY_PAID" ? (
            <div className="mt-1 grid grid-cols-3 gap-x-3 rounded-lg bg-surface px-2 py-1.5 text-xs">
              <div>
                <div className="text-muted">Total</div>
                <div className="font-medium tabular-nums">{formatINR(milestone.amount)}</div>
              </div>
              <div>
                <div className="text-muted">Received</div>
                <div className="font-medium text-ok tabular-nums">{formatINR(milestone.received)}</div>
              </div>
              <div>
                <div className="text-muted">Remaining</div>
                <div className="font-medium text-warn tabular-nums">
                  {formatINR(Decimal.max(0, new Decimal(milestone.amount).minus(milestone.received)))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted">
              {formatINR(milestone.amount)}
              {milestone.status === "PAID" && <span className="ml-1 text-ok">· paid</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={variant}>{milestone.status.replace(/_/g, " ")}</Badge>
          {isAdmin && !milestone.invoiceNo && (
            <button className="text-xs text-primary disabled:opacity-50" onClick={createAndOpen} disabled={creating}>
              <FileText className="inline size-3.5" /> {creating ? "Creating…" : "Invoice"}
            </button>
          )}
          {milestone.invoiceNo && milestone.invoiceId && (
            <button className="text-xs text-ok hover:underline" onClick={() => setPanelInvoiceId(milestone.invoiceId)}>
              {milestone.invoiceNo}
            </button>
          )}
          {isAdmin && (
            <button className="text-xs text-muted" onClick={() => setSched(!sched)}>
              <CalendarClock className="inline size-3.5" /> Schedule
            </button>
          )}
          {isAdmin && milestone.status !== "PAID" && (
            <button className="text-xs text-primary" onClick={() => setOpen(!open)}>
              <ReceiptIcon className="inline size-3.5" /> Receipt
            </button>
          )}
        </div>
      </div>
      {sched && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-surface p-2">
          {milestone.dueBasis === "STAGE_COMPLETION" ? (
            <Field label="Linked stage" hint="Milestone falls DUE when this stage completes.">
              <Select className="h-9" value={linked} onChange={(e) => setLinked(e.target.value)}>
                <option value="">— none —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Due date" hint="Drives the overdue-receivables engine.">
              <Input type="date" className="h-9" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  setMilestoneScheduleAction(
                    orderId,
                    milestone.id,
                    milestone.dueBasis === "STAGE_COMPLETION"
                      ? { linkedStageId: linked || null }
                      : { dueDate: due || null },
                  ),
                () => setSched(false),
              )
            }
          >
            Save schedule
          </Button>
        </div>
      )}
      {open && (
        <div className="mt-2 flex items-end gap-2">
          {err && <div className="text-xs text-danger">{err}</div>}
          <Field label="Amount">
            <Input className="h-9 w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Mode">
            <Select className="h-9" value={mode} onChange={(e) => setMode(e.target.value)}>
              {["CASH", "CHEQUE", "NEFT", "UPI"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Button size="sm" disabled={pending || !amount} onClick={() => run(() => addReceiptAction(orderId, milestone.id, { date: new Date(), amount: Number(amount), mode }), () => { setOpen(false); setAmount(""); })}>
            Record
          </Button>
        </div>
      )}
      <InvoicePanel
        invoiceId={panelInvoiceId}
        open={panelInvoiceId !== null}
        onClose={() => setPanelInvoiceId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/**
 * Add a payment milestone to this order — the only path is normally the proposal's
 * payment terms at Won→Order conversion, so an order created without any (or one
 * needing an extra milestone later, e.g. a change order) had no way to get one.
 * Once created, the milestone's own "Receipt" button (above) is how a payment
 * actually gets collected against it.
 */
export function AddMilestoneForm({ orderId, stages }: { orderId: string; stages: { id: string; name: string }[] }) {
  const { run, pending, err } = useRun();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueBasis, setDueBasis] = useState<"DATE" | "STAGE_COMPLETION">("DATE");
  const [dueDate, setDueDate] = useState("");
  const [linkedStageId, setLinkedStageId] = useState("");

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add milestone
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-surface p-3">
      {err && <div className="text-xs text-danger">{err}</div>}
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Description">
          <Input placeholder="e.g. 30% on equipment delivery" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Amount ₹">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Due basis">
          <Select value={dueBasis} onChange={(e) => setDueBasis(e.target.value as "DATE" | "STAGE_COMPLETION")}>
            <option value="DATE">By date</option>
            <option value="STAGE_COMPLETION">On stage completion</option>
          </Select>
        </Field>
        {dueBasis === "STAGE_COMPLETION" ? (
          <Field label="Linked stage">
            <Select value={linkedStageId} onChange={(e) => setLinkedStageId(e.target.value)}>
              <option value="">— none —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !description.trim() || !amount}
          onClick={() =>
            run(
              () =>
                addMilestoneAction(orderId, {
                  description,
                  amount: Number(amount),
                  dueBasis,
                  dueDate: dueBasis === "DATE" ? dueDate || null : null,
                  linkedStageId: dueBasis === "STAGE_COMPLETION" ? linkedStageId || null : null,
                }),
              () => {
                setOpen(false);
                setDescription("");
                setAmount("");
                setDueDate("");
                setLinkedStageId("");
              },
            )
          }
        >
          Save milestone
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
