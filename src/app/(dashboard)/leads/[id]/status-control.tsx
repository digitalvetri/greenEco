"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, PauseCircle, XCircle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { LOST_REASONS } from "@/lib/constants";
import { setLeadStatusAction, archiveLeadAction } from "../actions";

const OPEN = ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED"];

/**
 * Manual lifecycle control on the lead detail: reopen a closed lead, put one on
 * hold, mark lost (with a required reason), or archive. Status changes are
 * available to admin + owner; archive is admin-only.
 */
export function LeadStatusControl({
  leadId,
  status,
  isAdmin,
}: {
  leadId: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const isOpen = OPEN.includes(status);

  function change(next: string, lostReason?: string) {
    start(async () => {
      try {
        await setLeadStatusAction(leadId, { status: next, lostReason });
        toast(next === "IN_FOLLOWUP" ? "Lead reopened" : `Marked ${next.replace(/_/g, " ").toLowerCase()}`);
        setLostOpen(false);
        setReason("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update status", "error");
      }
    });
  }

  function archive() {
    if (!confirm("Archive this lead? It will be hidden from all lists.")) return;
    start(async () => {
      try {
        await archiveLeadAction(leadId);
        toast("Lead archived");
        router.push("/leads");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not archive", "error");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isOpen && status !== "CONVERTED" && (
        <Button variant="outline" size="sm" onClick={() => change("IN_FOLLOWUP")} disabled={pending}>
          <RotateCcw className="size-4" /> Reopen
        </Button>
      )}
      {isOpen && (
        <>
          <Button variant="outline" size="sm" onClick={() => change("ON_HOLD")} disabled={pending}>
            <PauseCircle className="size-4" /> On hold
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLostOpen(true)} disabled={pending}>
            <XCircle className="size-4" /> Mark lost
          </Button>
        </>
      )}
      {isAdmin && (
        <Button variant="ghost" size="sm" onClick={archive} disabled={pending} className="text-danger">
          <Archive className="size-4" /> Archive
        </Button>
      )}

      <Dialog open={lostOpen} onClose={() => setLostOpen(false)} title="Mark lead as lost">
        <div className="space-y-3">
          <div>
            <Label>Reason *</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select a reason…</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any detail worth recording…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending || !reason}
              onClick={() => change("LOST", note.trim() ? `${reason} — ${note.trim()}` : reason)}
            >
              Mark lost
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
