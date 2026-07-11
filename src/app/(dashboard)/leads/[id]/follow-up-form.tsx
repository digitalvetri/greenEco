"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SpeakButton } from "@/components/mobile/speak-button";
import { submitOrQueue } from "@/lib/offline-queue";

const TYPES = ["CALL", "SITE_VISIT", "WHATSAPP", "EMAIL", "MEETING"];
const OUTCOMES = ["INTERESTED", "NEEDS_TIME", "PRICE_DISCUSSION", "NOT_REACHABLE", "NEGATIVE"];

export function FollowUpForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | undefined>();

  const [f, setF] = useState({
    type: "CALL",
    notes: "",
    outcome: "",
    nextDate: "",
    close: "" as "" | "LOST" | "ON_HOLD",
    lostReason: "",
  });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function submit() {
    setError(null);
    let coords: { lat?: number; lng?: number } = {};
    const doSubmit = () => {
      startTransition(async () => {
        // Offline-tolerant: network-first, else queued in IndexedDB and replayed.
        const res = await submitOrQueue(
          "/api/followups",
          {
            leadId,
            type: f.type,
            notes: f.notes,
            rawTranscript: raw,
            outcome: f.outcome || undefined,
            nextDate: f.nextDate || undefined,
            closeStatus: f.close || undefined,
            lostReason: f.close === "LOST" ? f.lostReason : undefined,
            ...coords,
          },
          "Follow-up",
        );
        if (!res.ok) {
          setError(res.error ?? "Failed to save follow-up");
          return;
        }
        setF({ type: "CALL", notes: "", outcome: "", nextDate: "", close: "", lostReason: "" });
        setRaw(undefined);
        if (res.queued) setError("Saved offline — will sync when you reconnect.");
        router.refresh();
      });
    };
    // Best-effort GPS capture, then submit either way.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          coords = { lat: p.coords.latitude, lng: p.coords.longitude };
          doSubmit();
        },
        () => doSubmit(),
        { timeout: 4000 },
      );
    } else {
      doSubmit();
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Add Follow-up</span>
          <SpeakButton
            onTranscript={(t, r) => {
              set("notes", t);
              setRaw(r);
            }}
          />
        </div>
        {error && <div className="rounded bg-danger/10 px-2 py-1 text-xs text-danger">{error}</div>}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <Select value={f.type} onChange={(e) => set("type", e.target.value)}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Outcome">
            <Select value={f.outcome} onChange={(e) => set("outcome", e.target.value)}>
              <option value="">—</option>
              {OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notes" required>
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={`Next follow-up date${f.close ? " (not needed)" : ""}`} required={!f.close}>
            <Input
              type="date"
              value={f.nextDate}
              disabled={!!f.close}
              onChange={(e) => set("nextDate", e.target.value)}
            />
          </Field>
          <Field label="Close lead as">
            <Select value={f.close} onChange={(e) => set("close", e.target.value as typeof f.close)}>
              <option value="">Keep open</option>
              <option value="ON_HOLD">On hold</option>
              <option value="LOST">Lost</option>
            </Select>
          </Field>
        </div>

        {f.close === "LOST" && (
          <Field label="Lost reason" required>
            <Input value={f.lostReason} onChange={(e) => set("lostReason", e.target.value)} />
          </Field>
        )}

        <Button onClick={submit} disabled={pending || !f.notes}>
          {pending ? "Saving…" : "Save Follow-up"}
        </Button>
      </CardContent>
    </Card>
  );
}
