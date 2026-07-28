"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { stockAuditAction } from "./actions";

/**
 * Correct one item's on-hand count without leaving the main Stock page — the full
 * Operations → Stock Audit count-sheet (every item at once) is still there for a
 * proper recount, but a single wrong number shouldn't need that detour. Posts the
 * same stockAudit (variance → immutable ADJUST movement), just scoped to one item.
 */
export function QuickAuditButton({
  itemId,
  itemName,
  unit,
  locations,
  currentByLocation,
}: {
  itemId: string;
  itemName: string;
  unit: string;
  locations: { id: string; name: string }[];
  currentByLocation: { location: string; qty: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [pending, start] = useTransition();

  const currentAtLocation = locations.find((l) => l.id === locationId);
  const currentQty = currentAtLocation
    ? (currentByLocation.find((b) => b.location === currentAtLocation.name)?.qty ?? "0")
    : null;

  function submit() {
    if (!locationId || countedQty.trim() === "" || Number.isNaN(Number(countedQty))) return;
    start(async () => {
      try {
        await stockAuditAction(locationId, [{ itemId, countedQty: Number(countedQty) }]);
        toast("Stock count updated.");
        setOpen(false);
        setLocationId("");
        setCountedQty("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update count", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Correct stock count for ${itemName}`}
        title="Correct stock count"
        className="inline-flex items-center gap-1 rounded p-1 text-muted hover:text-primary"
      >
        <ClipboardCheck className="size-3.5" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Correct count — ${itemName}`}>
        <div className="space-y-3">
          <Field label="Location" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Actual counted quantity (${unit})`}
            required
            hint={currentQty != null ? `System currently shows ${currentQty} ${unit} here.` : undefined}
          >
            <Input
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              placeholder={currentQty ?? "0"}
            />
          </Field>
          <p className="text-xs text-muted">
            The difference is posted as a stock adjustment — the movement ledger stays a complete,
            append-only record, never a silent overwrite.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" loading={pending} disabled={!locationId || countedQty.trim() === ""} onClick={submit}>
              <ClipboardCheck className="size-4" /> Save count
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
