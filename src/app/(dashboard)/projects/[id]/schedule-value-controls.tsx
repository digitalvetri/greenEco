"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/money";
import { setOrderScheduleAction, setOrderValueAction, setOrderBudgetAction } from "../actions";

/** yyyy-mm-dd for <input type=date> from an ISO string / Date. */
function toDateInput(v: string | null | undefined): string {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export function ScheduleControl({
  orderId,
  startDate,
  targetDate,
}: {
  orderId: string;
  startDate: string | null;
  targetDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [startVal, setStartVal] = useState(toDateInput(startDate));
  const [targetVal, setTargetVal] = useState(toDateInput(targetDate));

  function save() {
    start(async () => {
      try {
        await setOrderScheduleAction(orderId, {
          startDate: startVal || null,
          targetDate: targetVal || null,
        });
        toast("Schedule updated");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update schedule", "error");
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Reschedule
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Reschedule project">
        <div className="space-y-3">
          <Field label="Start date">
            <Input type="date" value={startVal} onChange={(e) => setStartVal(e.target.value)} />
          </Field>
          <Field label="Target completion">
            <Input type="date" value={targetVal} onChange={(e) => setTargetVal(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={pending} onClick={save}>
              Save dates
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Inline date picker — shows the date as clickable text; tap to switch to a date input. */
export function InlineDateEdit({
  orderId,
  field,
  startDate,
  targetDate,
}: {
  orderId: string;
  field: "startDate" | "targetDate";
  startDate: string | null;
  targetDate: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const value = field === "startDate" ? startDate : targetDate;
  // Always start in display mode — entering edit mode (and focusing the input) should
  // only ever happen from a user click, never automatically just because the date
  // happens to be unset (was auto-focusing on page load, popping the mobile keyboard
  // and jumping scroll position with zero user interaction).
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(toDateInput(value));

  function save(newVal: string) {
    if (!newVal) { setEditing(false); return; }
    start(async () => {
      try {
        await setOrderScheduleAction(orderId, {
          startDate: field === "startDate" ? newVal : (toDateInput(startDate) || null),
          targetDate: field === "targetDate" ? newVal : (toDateInput(targetDate) || null),
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update date", "error");
      }
    });
  }

  if (editing) {
    return (
      <Input
        type="date"
        value={dateVal}
        autoFocus={!value}
        className="h-7 w-36 text-sm font-medium"
        onChange={(e) => setDateVal(e.target.value)}
        onBlur={() => save(dateVal)}
        onKeyDown={(e) => { if (e.key === "Enter") save(dateVal); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1 text-sm font-medium hover:text-primary"
      title="Click to change date"
    >
      {value
        ? new Date(value).toLocaleDateString("en-IN")
        : <span className="text-muted italic">— not set, click to add</span>}
      <Pencil className="size-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function ValueControl({
  orderId,
  projectValue,
}: {
  orderId: string;
  projectValue: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [value, setValue] = useState(projectValue);
  const [reason, setReason] = useState("");

  function save() {
    if (!reason.trim()) {
      toast("A reason for the change is required", "error");
      return;
    }
    start(async () => {
      try {
        await setOrderValueAction(orderId, { projectValue: value, reason: reason.trim() });
        toast("Project value updated");
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update value", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit project value"
        className="text-muted transition-colors hover:text-primary"
      >
        <Pencil className="size-3.5" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Revise project value">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Current: <span className="font-medium text-foreground">{formatINR(projectValue)}</span>. Changing this
            affects gross margin and budget variance — the reason is logged.
          </p>
          <Field label="New project value (₹)">
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="e.g. 1950000"
            />
          </Field>
          <Field label="Reason for change" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scope added: extra 10 KLD polishing unit"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={pending} onClick={save}>
              Save value
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * Correct the project's execution budget — the quote-stage estimate seeded it once
 * (or a 70%-of-value guess if none was entered); this lets an admin fix it to the
 * real figure at any point during execution, once it's actually known.
 */
export function BudgetControl({ orderId, budget }: { orderId: string; budget: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(budget);
  const [reason, setReason] = useState("");

  function save() {
    if (!reason.trim()) {
      toast("A reason for the change is required", "error");
      return;
    }
    start(async () => {
      try {
        await setOrderBudgetAction(orderId, { amount, reason: reason.trim() });
        toast("Budget updated");
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update budget", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit budget"
        className="text-muted transition-colors hover:text-primary"
      >
        <Pencil className="size-3.5" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Fix final budget">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Current: <span className="font-medium text-foreground">{formatINR(budget)}</span>. This was seeded from
            the quote&apos;s estimated cost (or a 70% guess if none was entered) — correct it once the real project
            budget is known. Affects Budget vs Actual and overrun alerts; the reason is logged.
          </p>
          <Field label="Final budget (₹)">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="e.g. 1350000"
            />
          </Field>
          <Field label="Reason for change" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Confirmed material + labour cost after site survey"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={pending} onClick={save}>
              Save budget
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
