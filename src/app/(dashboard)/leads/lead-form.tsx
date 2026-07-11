"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Input, Textarea, Label, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SpeakButton } from "@/components/mobile/speak-button";
import {
  LEAD_SOURCES,
  PLANT_TYPES,
  TECHNOLOGIES,
  SEGMENTS,
  BUDGET_BANDS,
  DECISION_TIMELINES,
} from "@/lib/constants";
import { createLeadAction, updateLeadAction } from "./actions";

interface Contact {
  name: string;
  designation: string;
  mobile: string;
}

/** Sizing/water-quality fields arrive as strings from the form (schema coerces). */
export interface LeadFormInitial {
  customerName: string;
  address: string;
  phone: string;
  email: string;
  source: string;
  requirement: string;
  lat?: number;
  lng?: number;
  plantType?: string;
  technology?: string;
  capacityKLD?: string;
  segment?: string;
  budgetBand?: string;
  decisionTimeline?: string;
  inletBOD?: string;
  inletCOD?: string;
  inletTSS?: string;
  inletTDS?: string;
}

/**
 * Create or edit a lead. In edit mode the contacts/reference section is hidden
 * (those are managed separately) and the core fields submit via updateLeadAction.
 */
export function LeadForm({ mode = "create", leadId, initial }: {
  mode?: "create" | "edit";
  leadId?: string;
  initial?: LeadFormInitial;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; customerName: string } | null>(null);

  const [form, setForm] = useState({
    customerName: initial?.customerName ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    source: initial?.source ?? "Reference",
    requirement: initial?.requirement ?? "",
    lat: initial?.lat as number | undefined,
    lng: initial?.lng as number | undefined,
    plantType: initial?.plantType ?? "",
    technology: initial?.technology ?? "",
    capacityKLD: initial?.capacityKLD ?? "",
    segment: initial?.segment ?? "",
    budgetBand: initial?.budgetBand ?? "",
    decisionTimeline: initial?.decisionTimeline ?? "",
    inletBOD: initial?.inletBOD ?? "",
    inletCOD: initial?.inletCOD ?? "",
    inletTSS: initial?.inletTSS ?? "",
    inletTDS: initial?.inletTDS ?? "",
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [reference, setReference] = useState({ name: "", phone: "" });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function pinLocation() {
    if (!navigator.geolocation) return setError("Geolocation not available");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("lat", pos.coords.latitude);
        set("lng", pos.coords.longitude);
      },
      () => setError("Could not get location (permission denied?)"),
    );
  }

  function submit(override = false) {
    setError(null);
    const base = {
      ...form,
      email: form.email || undefined,
      requirement: form.requirement || undefined,
      overrideDuplicate: override,
    };
    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateLeadAction(leadId!, base)
          : await createLeadAction({
              ...base,
              contacts: contacts.filter((c) => c.name && c.mobile),
              reference: reference.name ? reference : undefined,
            });
        if ("duplicate" in res && res.duplicate) {
          setDuplicate(res.duplicate);
          return;
        }
        if ("lead" in res && res.lead) {
          router.push(`/leads/${isEdit ? leadId : res.lead.id}`);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save lead");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-4">
          <Field label="Customer Name" required>
            <Input
              value={form.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              placeholder="e.g. Green Meadows Apartments Assn."
            />
          </Field>

          <div>
            <Label>Address *</Label>
            <div className="flex gap-2">
              <Textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Site address"
                aria-label="Address"
                className="min-h-16"
              />
              <Button type="button" variant="outline" size="sm" onClick={pinLocation} className="h-auto shrink-0">
                <MapPin className="size-4" />
              </Button>
            </div>
            {form.lat && (
              <p className="mt-1 text-[11px] text-ok">
                Pinned: {form.lat.toFixed(5)}, {form.lng?.toFixed(5)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone (10 digits)" required>
              <Input
                value={form.phone}
                inputMode="numeric"
                maxLength={10}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                placeholder="9XXXXXXXXX"
              />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>

          <Field label="Source" required>
            <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              <SpeakButton onTranscript={(t) => set("requirement", t)} />
            </div>
            <Textarea
              value={form.requirement}
              onChange={(e) => set("requirement", e.target.value)}
              placeholder="Anything else about the requirement… (or Speak)"
              aria-label="Notes"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <span className="text-sm font-semibold">Plant sizing</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Plant type">
              <Select value={form.plantType} onChange={(e) => set("plantType", e.target.value)}>
                <option value="">—</option>
                {PLANT_TYPES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Technology">
              <Select value={form.technology} onChange={(e) => set("technology", e.target.value)}>
                <option value="">—</option>
                {TECHNOLOGIES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Capacity (KLD)">
              <Input
                value={form.capacityKLD}
                inputMode="decimal"
                onChange={(e) => set("capacityKLD", e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="e.g. 50"
              />
            </Field>
            <Field label="Segment">
              <Select value={form.segment} onChange={(e) => set("segment", e.target.value)}>
                <option value="">—</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Budget band">
              <Select value={form.budgetBand} onChange={(e) => set("budgetBand", e.target.value)}>
                <option value="">—</option>
                {BUDGET_BANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Decision timeline">
              <Select value={form.decisionTimeline} onChange={(e) => set("decisionTimeline", e.target.value)}>
                <option value="">—</option>
                {DECISION_TIMELINES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="border-t border-border pt-3">
            <Label>Inlet water quality (mg/l)</Label>
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["inletBOD", "inletCOD", "inletTSS", "inletTDS"] as const).map((k) => (
                <Field key={k} label={k.replace("inlet", "")}>
                  <Input
                    value={form[k]}
                    inputMode="decimal"
                    onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isEdit && (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Contact Persons</span>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => setContacts((c) => [...c, { name: "", designation: "", mobile: "" }])}
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input
                placeholder="Name"
                value={c.name}
                onChange={(e) =>
                  setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <Input
                placeholder="Designation"
                value={c.designation}
                onChange={(e) =>
                  setContacts((cs) =>
                    cs.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)),
                  )
                }
              />
              <Input
                placeholder="Mobile"
                value={c.mobile}
                onChange={(e) =>
                  setContacts((cs) =>
                    cs.map((x, j) =>
                      j === i ? { ...x, mobile: e.target.value.replace(/\D/g, "") } : x,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-danger" />
              </Button>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Field label="Reference (name)">
              <Input
                value={reference.name}
                onChange={(e) => setReference((r) => ({ ...r, name: e.target.value }))}
                placeholder="Who referred this lead"
              />
            </Field>
            <Field label="Reference phone">
              <Input
                value={reference.phone}
                onChange={(e) => setReference((r) => ({ ...r, phone: e.target.value }))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>
      )}

      <div className="flex gap-2">
        <Button onClick={() => submit(false)} disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Save Lead"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      {duplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-sm">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center gap-2 text-warn">
                <AlertTriangle className="size-5" />
                <span className="font-semibold">Possible duplicate</span>
              </div>
              <p className="text-sm">
                A lead with this phone already exists:{" "}
                <Link href={`/leads/${duplicate.id}`} className="font-medium text-primary underline">
                  {duplicate.customerName}
                </Link>
                .
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDuplicate(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDuplicate(null);
                    submit(true);
                  }}
                >
                  Save anyway
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
