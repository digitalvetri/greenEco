"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateFollowUpAction, deleteFollowUpAction } from "../actions";

const OUTCOMES = ["INTERESTED", "NEEDS_TIME", "PRICE_DISCUSSION", "NOT_REACHABLE", "NEGATIVE"];

/** Edit / delete a follow-up (correct a mistyped note, date, or outcome). */
export function FollowUpActions({
  leadId,
  followUpId,
  notes,
  nextDate,
  outcome,
}: {
  leadId: string;
  followUpId: string;
  notes: string;
  nextDate: string | null; // YYYY-MM-DD
  outcome: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState(notes);
  const [d, setD] = useState(nextDate ?? "");
  const [o, setO] = useState(outcome ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await updateFollowUpAction(leadId, followUpId, { notes: n, nextDate: d, outcome: o });
        toast("Follow-up updated");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update", "error");
      }
    });
  }

  function remove() {
    if (!confirm("Delete this follow-up?")) return;
    start(async () => {
      try {
        await deleteFollowUpAction(leadId, followUpId);
        toast("Follow-up deleted");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not delete", "error");
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button onClick={() => setEditing(true)} aria-label="Edit follow-up" className="text-muted hover:text-foreground">
        <Pencil className="size-3.5" />
      </button>
      <button onClick={remove} disabled={pending} aria-label="Delete follow-up" className="text-muted hover:text-danger disabled:opacity-50">
        <Trash2 className="size-3.5" />
      </button>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit follow-up">
        <div className="space-y-3">
          <Field label="Notes">
            <Textarea value={n} onChange={(e) => setN(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next follow-up date">
              <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </Field>
            <Field label="Outcome">
              <Select value={o} onChange={(e) => setO(e.target.value)}>
                <option value="">—</option>
                {OUTCOMES.map((x) => (
                  <option key={x} value={x}>{x.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={pending || !n.trim()} onClick={save}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
