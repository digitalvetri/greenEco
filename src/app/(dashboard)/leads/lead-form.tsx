"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Trash2, AlertTriangle, FileUp, Eye } from "lucide-react";
import Link from "next/link";
import { Input, Textarea, Label, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SpeakButton } from "@/components/mobile/speak-button";
import {
  LEAD_SOURCES,
  LEAD_TYPES,
  INDIAN_STATES,
  PLANT_TYPES,
  TECHNOLOGIES,
  SEGMENTS,
  BUDGET_BANDS,
  DECISION_TIMELINES,
  CAPACITY_UNITS,
} from "@/lib/constants";
import { createLeadAction, updateLeadAction, convertLeadAction } from "./actions";

interface Contact {
  name: string;
  designation: string;
  mobile: string;
  email: string;
  location: string;
}

interface BranchOffice {
  address: string;
  phone: string;
  email: string;
}

/** Sizing/water-quality fields arrive as strings from the form (schema coerces). */
export interface LeadFormInitial {
  customerName: string;
  address: string;
  projectName?: string;
  projectAddress?: string;
  phone: string;
  email: string;
  source: string;
  requirement: string;
  lat?: number;
  lng?: number;
  plantType?: string;
  technology?: string;
  capacityKLD?: string;
  capacityUnit?: string;
  segment?: string;
  budgetBand?: string;
  decisionTimeline?: string;
  inletBOD?: string;
  inletCOD?: string;
  inletTSS?: string;
  inletTDS?: string;
  leadType?: string;
  state?: string;
}

const PHONE_RE = /^[6-9]\d{9}$/;

/**
 * Create or edit a lead. In edit mode the contacts/reference/branch-office section is
 * hidden (those are managed separately) and plant sizing stays available (added once
 * the deal progresses); in create mode plant sizing is deliberately not shown at all —
 * a fresh enquiry rarely has it yet — and every save goes through a Preview step.
 */
export function LeadForm({ mode = "create", leadId, initial, initialContacts }: {
  mode?: "create" | "edit";
  leadId?: string;
  initial?: LeadFormInitial;
  initialContacts?: Contact[];
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; customerName: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // When true, after saving the lead we immediately start a proposal from it.
  const [thenProposal, setThenProposal] = useState(false);
  const [projectDetailsEnabled, setProjectDetailsEnabled] = useState(
    () => !!(initial?.projectName || initial?.projectAddress),
  );

  const [form, setForm] = useState({
    customerName: initial?.customerName ?? "",
    address: initial?.address ?? "",
    projectName: initial?.projectName ?? "",
    projectAddress: initial?.projectAddress ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    source: initial?.source ?? "Reference",
    requirement: initial?.requirement ?? "",
    lat: initial?.lat as number | undefined,
    lng: initial?.lng as number | undefined,
    plantType: initial?.plantType ?? "",
    technology: initial?.technology ?? "",
    capacityKLD: initial?.capacityKLD ?? "",
    capacityUnit: initial?.capacityUnit ?? "KLD",
    segment: initial?.segment ?? "",
    budgetBand: initial?.budgetBand ?? "",
    decisionTimeline: initial?.decisionTimeline ?? "",
    inletBOD: initial?.inletBOD ?? "",
    inletCOD: initial?.inletCOD ?? "",
    inletTSS: initial?.inletTSS ?? "",
    inletTDS: initial?.inletTDS ?? "",
    leadType: initial?.leadType ?? "",
    state: initial?.state ?? "",
  });
  const [contacts, setContacts] = useState<Contact[]>(initialContacts ?? []);
  const [reference, setReference] = useState({ name: "", phone: "" });
  const [branchOffices, setBranchOffices] = useState<BranchOffice[]>([]);

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

  function validate(): string | null {
    if (!form.customerName.trim()) return "Company / Customer Name is required";
    if (!PHONE_RE.test(form.phone)) return "Enter a valid 10-digit mobile number";
    if (!form.address.trim()) return "Address is required";
    if (!isEdit && !form.state) return "State is required";
    return null;
  }

  function openPreview() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPreviewOpen(true);
  }

  function submit(override = false, proposal = thenProposal) {
    const err = validate();
    if (err) {
      setError(err);
      setPreviewOpen(false);
      return;
    }
    setError(null);
    setThenProposal(proposal);
    const base = {
      ...form,
      email: form.email || undefined,
      requirement: form.requirement || undefined,
      leadType: form.leadType || undefined,
      state: form.state || undefined,
      capacityValue: form.capacityKLD ? Number(form.capacityKLD) : undefined,
      projectName: projectDetailsEnabled ? form.projectName || undefined : undefined,
      projectAddress: projectDetailsEnabled ? form.projectAddress || undefined : undefined,
      overrideDuplicate: override,
    };
    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateLeadAction(leadId!, base)
          : await createLeadAction({
              ...base,
              contacts: contacts
                .filter((c) => c.name && c.mobile)
                .map((c) => ({ ...c, email: c.email || undefined, location: c.location || undefined })),
              reference: reference.name ? reference : undefined,
              branchOffices: branchOffices.filter((b) => b.address).length
                ? branchOffices.filter((b) => b.address).map((b) => ({ ...b, email: b.email || undefined }))
                : undefined,
            });
        if ("duplicate" in res && res.duplicate) {
          setPreviewOpen(false);
          setDuplicate(res.duplicate);
          return;
        }
        if ("lead" in res && res.lead) {
          const newId = isEdit ? leadId! : res.lead.id;
          // One-click path: start a proposal straight from the new/edited lead.
          if (proposal) {
            try {
              const conv = await convertLeadAction(newId);
              router.push(`/proposals/${conv.proposalId}`);
              router.refresh();
              return;
            } catch (e) {
              // Lead saved fine; surface the conversion problem but don't lose the lead.
              setError(
                (e instanceof Error ? e.message : "Could not start proposal") +
                  " — the lead was saved; open it to convert.",
              );
              router.push(`/leads/${newId}`);
              router.refresh();
              return;
            }
          }
          router.push(`/leads/${newId}`);
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

      <div className={isEdit ? "grid gap-4 xl:grid-cols-2 xl:items-start" : "space-y-4"}>
      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Company / Customer Name" required>
              <Input
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="e.g. Green Meadows Apartments Assn."
              />
            </Field>
          </div>

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

          <Field label="Lead Type">
            <Select value={form.leadType} onChange={(e) => set("leadType", e.target.value)}>
              <option value="">—</option>
              {LEAD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="State" required={!isEdit}>
            <Select value={form.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">—</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2 lg:col-span-4">
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

          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 rounded-lg border border-dashed border-border p-3">
            <input
              type="checkbox"
              id="project-details-toggle"
              checked={projectDetailsEnabled}
              onChange={(e) => setProjectDetailsEnabled(e.target.checked)}
              className="size-4 shrink-0 accent-primary"
            />
            <label htmlFor="project-details-toggle" className="cursor-pointer text-sm font-medium">
              Project details known already (name &amp; site address) — most fresh enquiries don&apos;t have this yet
            </label>
          </div>

          {projectDetailsEnabled && (
            <>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Project Name">
                  <Input
                    value={form.projectName}
                    onChange={(e) => set("projectName", e.target.value)}
                    placeholder="e.g. STP Plant — Green Meadows Phase 2"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Project Address">
                  <Textarea
                    value={form.projectAddress}
                    onChange={(e) => set("projectAddress", e.target.value)}
                    placeholder="Installation / project site address"
                    aria-label="Project Address"
                    className="min-h-16"
                  />
                </Field>
              </div>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Source" required>
              <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!isEdit && form.source === "Reference" && (
            <div className="sm:col-span-2 lg:col-span-4 grid gap-3 rounded-lg border border-border bg-surface/60 p-3 sm:grid-cols-2">
              <Field label="Referred by (name)">
                <Input
                  value={reference.name}
                  onChange={(e) => setReference((r) => ({ ...r, name: e.target.value }))}
                  placeholder="Who referred this lead"
                />
              </Field>
              <Field label="Referred by (phone)">
                <Input
                  value={reference.phone}
                  inputMode="numeric"
                  onChange={(e) => setReference((r) => ({ ...r, phone: e.target.value.replace(/\D/g, "") }))}
                />
              </Field>
            </div>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between">
              <Label>Meeting Notes</Label>
              <SpeakButton onTranscript={(t) => set("requirement", t)} />
            </div>
            <Textarea
              value={form.requirement}
              onChange={(e) => set("requirement", e.target.value)}
              placeholder="What did you discuss? How did you first meet them? (or Speak)"
              aria-label="Meeting Notes"
            />
          </div>
        </CardContent>
      </Card>

      {isEdit && (
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
            <Field label="Capacity">
              <div className="flex gap-1.5">
                <Input
                  value={form.capacityKLD}
                  inputMode="decimal"
                  onChange={(e) => set("capacityKLD", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="e.g. 50"
                />
                <Select
                  value={form.capacityUnit}
                  onChange={(e) => set("capacityUnit", e.target.value)}
                  className="w-28 shrink-0"
                >
                  {CAPACITY_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </div>
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
      )}

      {!isEdit && (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Contact Persons</span>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() =>
                setContacts((c) => [...c, { name: "", designation: "", mobile: "", email: "", location: "" }])
              }
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
          {contacts.map((c, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
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
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Email (optional)"
                  value={c.email}
                  onChange={(e) =>
                    setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                  }
                />
                <Input
                  placeholder="Where usually available (optional)"
                  value={c.location}
                  onChange={(e) =>
                    setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))
                  }
                />
              </div>
            </div>
          ))}

          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Branch offices</span>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => setBranchOffices((b) => [...b, { address: "", phone: "", email: "" }])}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
            {branchOffices.map((b, i) => (
              <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Branch address"
                  value={b.address}
                  onChange={(e) =>
                    setBranchOffices((bs) => bs.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))
                  }
                />
                <Input
                  placeholder="Phone"
                  value={b.phone}
                  onChange={(e) =>
                    setBranchOffices((bs) => bs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))
                  }
                />
                <Input
                  placeholder="Email"
                  value={b.email}
                  onChange={(e) =>
                    setBranchOffices((bs) => bs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setBranchOffices((bs) => bs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isEdit ? (
          <Button onClick={() => submit(false, false)} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <Button onClick={openPreview} disabled={pending}>
            <Eye className="size-4" /> Preview
          </Button>
        )}
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview Lead" className="max-w-lg">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
          <PreviewRow label="Company / Customer Name" value={form.customerName} />
          <PreviewRow label="Phone" value={form.phone} />
          <PreviewRow label="Email" value={form.email} />
          <PreviewRow label="Lead Type" value={form.leadType} />
          <PreviewRow label="State" value={form.state} />
          <PreviewRow label="Address" value={form.address} />
          {projectDetailsEnabled && (
            <>
              <PreviewRow label="Project Name" value={form.projectName} />
              <PreviewRow label="Project Address" value={form.projectAddress} />
            </>
          )}
          <PreviewRow label="Source" value={form.source} />
          {!isEdit && form.source === "Reference" && reference.name && (
            <PreviewRow label="Referred by" value={`${reference.name}${reference.phone ? ` · ${reference.phone}` : ""}`} />
          )}
          <PreviewRow label="Meeting Notes" value={form.requirement} />
          {contacts.filter((c) => c.name).length > 0 && (
            <div>
              <div className="text-muted">Contact Persons</div>
              {contacts
                .filter((c) => c.name)
                .map((c, i) => (
                  <div key={i} className="mt-0.5 text-xs">
                    {c.name}
                    {c.designation ? ` · ${c.designation}` : ""}
                    {c.mobile ? ` · ${c.mobile}` : ""}
                  </div>
                ))}
            </div>
          )}
          {branchOffices.filter((b) => b.address).length > 0 && (
            <div>
              <div className="text-muted">Branch offices</div>
              {branchOffices
                .filter((b) => b.address)
                .map((b, i) => (
                  <div key={i} className="mt-0.5 text-xs">
                    {b.address}
                    {b.phone ? ` · ${b.phone}` : ""}
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button onClick={() => submit(false, false)} disabled={pending}>
            {pending && !thenProposal ? "Saving…" : "Save Lead"}
          </Button>
          <Button variant="subtle" onClick={() => submit(false, true)} disabled={pending}>
            <FileUp className="size-4" />
            {pending && thenProposal ? "Starting proposal…" : "Save & start proposal"}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={pending}>
            Back to edit
          </Button>
        </div>
      </Dialog>

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

function PreviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
