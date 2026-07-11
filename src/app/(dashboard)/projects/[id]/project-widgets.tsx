"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Receipt as ReceiptIcon, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Uploader } from "@/components/mobile/uploader";
import { formatINR } from "@/lib/money";
import {
  updateStageAction,
  addStagePhotoAction,
  addDrawingAction,
  addReceiptAction,
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

export function StageRow({
  orderId,
  stage,
}: {
  orderId: string;
  stage: { id: string; seq: number; name: string; status: string; plannedDate: string | null; actualDate: string | null; notes: string | null; delayReason: string | null; photos: { id: string; url: string }[] };
}) {
  const { run, pending, err } = useRun();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(stage.status);
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [delay, setDelay] = useState(stage.delayReason ?? "");
  const [planned, setPlanned] = useState(stage.plannedDate?.slice(0, 10) ?? "");

  const variant = stage.status === "DONE" ? "ok" : stage.status === "IN_PROGRESS" ? "primary" : "default";

  return (
    <div className="border-t border-border py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{stage.seq}.</span>
          <span className="text-sm font-medium">{stage.name}</span>
          <Badge variant={variant}>{stage.status.replace(/_/g, " ")}</Badge>
        </div>
        <button className="text-xs text-primary" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Update"}
        </button>
      </div>
      <div className="ml-6 mt-1 flex gap-1">
        {stage.photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url} alt="" className="size-10 rounded border border-border object-cover" />
        ))}
      </div>
      {open && (
        <div className="ml-6 mt-2 space-y-2">
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
          {stage.plannedDate && stage.status !== "DONE" && new Date(stage.plannedDate) < new Date() && (
            <Input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="Delay reason (required — past planned date)" aria-label="Delay reason" />
          )}
          <Button size="sm" disabled={pending} onClick={() => run(() => updateStageAction(orderId, stage.id, { status, notes, delayReason: delay || undefined, plannedDate: planned ? new Date(planned) : null }), () => setOpen(false))}>
            <Check className="size-4" /> Save
          </Button>
        </div>
      )}
    </div>
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
          {["Structural", "Piping", "Electrical", "Layout"].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </div>
      <Uploader
        label="Upload drawing"
        accept="application/pdf,image/*"
        compress={false}
        onUploaded={(files) => {
          if (!title) return;
          run(() => addDrawingAction(orderId, { title, discipline, fileUrl: files[0].url }), () => setTitle(""));
        }}
      />
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
    dueBasis: string;
    dueDate: string | null;
    linkedStageId: string | null;
  };
  isAdmin: boolean;
  stages?: { id: string; name: string }[];
}) {
  const { run, pending, err } = useRun();
  const [open, setOpen] = useState(false);
  const [sched, setSched] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("NEFT");
  const [due, setDue] = useState(milestone.dueDate?.slice(0, 10) ?? "");
  const [linked, setLinked] = useState(milestone.linkedStageId ?? "");
  const variant = milestone.status === "PAID" ? "ok" : milestone.status === "DUE" ? "warn" : milestone.status === "PARTIALLY_PAID" ? "primary" : "default";

  return (
    <div className="border-t border-border py-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{milestone.description}</div>
          <div className="text-xs text-muted">
            {formatINR(milestone.amount)}
            {Number(milestone.received) > 0 && ` · received ${formatINR(milestone.received)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={variant}>{milestone.status.replace(/_/g, " ")}</Badge>
          {isAdmin && !milestone.invoiceNo && (
            <button className="text-xs text-primary" onClick={() => run(() => createInvoiceAction(orderId, milestone.id))} disabled={pending}>
              <FileText className="inline size-3.5" /> Invoice
            </button>
          )}
          {milestone.invoiceNo && (
            <a href={`/print/invoice/${milestone.invoiceNo}`} target="_blank" rel="noreferrer" className="text-xs text-ok">
              {milestone.invoiceNo}
            </a>
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
    </div>
  );
}
