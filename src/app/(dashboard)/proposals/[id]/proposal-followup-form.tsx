"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/mobile/speak-button";
import { submitOrQueue } from "@/lib/offline-queue";

const TYPES = ["CALL", "SITE_VISIT", "WHATSAPP", "EMAIL", "MEETING"];
const OUTCOMES = ["INTERESTED", "NEEDS_TIME", "PRICE_DISCUSSION", "NOT_REACHABLE", "NEGATIVE"];

/** Same follow-up engine as Leads' FollowUpForm, scoped to a proposal instead —
 *  no close/lost-reason fields here, since proposal status has its own dedicated
 *  controls (Mark under negotiation / Reopen / Mark lost) elsewhere in the editor. */
export function ProposalFollowUpForm({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | undefined>();

  const [f, setF] = useState({ type: "CALL", notes: "", outcome: "", nextDate: "" });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function submit() {
    setError(null);
    let coords: { lat?: number; lng?: number } = {};
    const doSubmit = () => {
      startTransition(async () => {
        const res = await submitOrQueue(
          "/api/followups",
          {
            proposalId,
            type: f.type,
            notes: f.notes,
            rawTranscript: raw,
            outcome: f.outcome || undefined,
            nextDate: f.nextDate || undefined,
            ...coords,
          },
          "Follow-up",
        );
        if (!res.ok) {
          setError(res.error ?? "Failed to save follow-up");
          return;
        }
        setF({ type: "CALL", notes: "", outcome: "", nextDate: "" });
        setRaw(undefined);
        if (res.queued) setError("Saved offline — will sync when you reconnect.");
        router.refresh();
      });
    };
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
    <div className="space-y-3">
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

      <Field label="Next follow-up date" required>
        <Input
          type="date"
          required
          value={f.nextDate}
          onChange={(e) => set("nextDate", e.target.value)}
        />
      </Field>

      <Button onClick={submit} disabled={pending || !f.notes || !f.nextDate}>
        {pending ? "Saving…" : "Save Follow-up"}
      </Button>
    </div>
  );
}
