"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Uploader, Thumb } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import { completeVisitAction, generateAmcInvoiceAction } from "../actions";

export function CompleteVisit({ contractId, visitId }: { contractId: string; visitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [r, setR] = useState({ ph: "", do: "", flowKld: "", blowerHours: "" });
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ url: string }[]>([]);

  function submit() {
    start(async () => {
      try {
        const readings = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
        await completeVisitAction(contractId, visitId, {
          readings,
          notes,
          photos,
          ...(await geo()),
        });
        toast("Visit completed");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Check className="size-4" /> Complete
      </Button>
    );

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="grid grid-cols-4 gap-2">
        <Field label="pH">
          <Input className="h-9" value={r.ph} onChange={(e) => setR({ ...r, ph: e.target.value })} />
        </Field>
        <Field label="DO mg/l">
          <Input className="h-9" value={r.do} onChange={(e) => setR({ ...r, do: e.target.value })} />
        </Field>
        <Field label="Flow KLD">
          <Input className="h-9" value={r.flowKld} onChange={(e) => setR({ ...r, flowKld: e.target.value })} />
        </Field>
        <Field label="Blower hrs">
          <Input className="h-9" value={r.blowerHours} onChange={(e) => setR({ ...r, blowerHours: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea className="min-h-14" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations / work done" />
      </Field>
      <div className="flex items-center gap-2">
        <Uploader label="Site photo" capture onUploaded={(f) => setPhotos([...photos, ...f])} />
        {photos.map((p, i) => (
          <Thumb key={i} url={p.url} onRemove={() => setPhotos(photos.filter((_, j) => j !== i))} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={submit}>
          Save visit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function geo(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 4000 },
    );
  });
}

export function GenerateAmcInvoiceButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      try {
        const label = new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });
        const res = await generateAmcInvoiceAction(contractId, label);
        toast(`Invoice ${res.invoiceNo} raised · ${res.amount ? "₹" + res.amount : ""}`);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }
  return (
    <Button size="sm" variant="subtle" loading={pending} onClick={run}>
      <FileText className="size-4" /> Bill AMC period
    </Button>
  );
}
