"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { PLANT_TYPES } from "@/lib/constants";
import type { AmcProposalData, ServiceProposalData } from "@/lib/domain/proposal-document";

/**
 * The AMC Quotation's and the Service Proforma's own content, editable per proposal.
 *
 * These sections were seeded at creation and PRINTED, but had no editor at all — the
 * v45 "editable afterwards" bug repeated: the 11 scope notes, the units list and the
 * machinery list all appear on a document the customer reads, and correcting a pump
 * count meant editing the database. Everything here is this proposal's own copy, so
 * editing it never touches the shared template.
 */
export function AmcSections({
  doc,
  onChange,
  editable,
}: {
  doc: AmcProposalData;
  onChange: (patch: Partial<AmcProposalData>) => void;
  editable: boolean;
}) {
  const units = doc.units ?? [];
  const equipment = doc.equipment ?? [];
  const extra = doc.additionalPlants ?? [];

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>AMC document content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted">
          What this quotation prints besides the charge table. Filled in from the standard format
          when the proposal was created — edits apply to this proposal only.
        </p>

        <Section title="Units in the treatment plant" count={`${units.length} units`}>
          <StringList
            rows={units}
            editable={editable}
            placeholder="e.g. SBR Tank"
            addLabel="Add unit"
            onChange={(rows) => onChange({ units: rows })}
          />
        </Section>

        <Section title="Machinery & equipment" count={`${equipment.length} items`}>
          {equipment.map((e, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input
                className="h-8 flex-1"
                aria-label={`Equipment ${i + 1} name`}
                value={e.name}
                disabled={!editable}
                onChange={(ev) =>
                  onChange({
                    equipment: equipment.map((r, j) => (j === i ? { ...r, name: ev.target.value } : r)),
                  })
                }
              />
              <Input
                className="h-8 w-36"
                aria-label={`Equipment ${i + 1} quantity`}
                placeholder="5 Nos"
                value={e.qty ?? ""}
                disabled={!editable}
                onChange={(ev) =>
                  onChange({
                    equipment: equipment.map((r, j) => (j === i ? { ...r, qty: ev.target.value } : r)),
                  })
                }
              />
              {editable && (
                <button
                  aria-label={`Remove equipment ${i + 1}`}
                  onClick={() => onChange({ equipment: equipment.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4 text-danger" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ equipment: [...equipment, { name: "", qty: "" }] })}>
              <Plus className="size-4" /> Add equipment
            </Button>
          )}
        </Section>

        <Section
          title="A second plant on this contract"
          count={extra.length ? extra.map((p) => p.plantType).join(", ") : "none"}
        >
          <p className="mb-2 text-xs text-muted">
            Optional. A contract covering an STP and an ETP together prints both in the title and
            lists each one&apos;s units separately.
          </p>
          {extra.map((pl, i) => (
            <div key={i} className="mb-3 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Plant type">
                  <Select
                    value={pl.plantType}
                    disabled={!editable}
                    onChange={(e) =>
                      onChange({
                        additionalPlants: extra.map((r, j) => (j === i ? { ...r, plantType: e.target.value } : r)),
                      })
                    }
                  >
                    {PLANT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Capacity">
                  <Input
                    type="number"
                    value={pl.capacityValue ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      onChange({
                        additionalPlants: extra.map((r, j) =>
                          j === i ? { ...r, capacityValue: Number(e.target.value) || undefined } : r,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Unit">
                  <Input
                    value={pl.capacityUnit ?? "KLD"}
                    disabled={!editable}
                    onChange={(e) =>
                      onChange({
                        additionalPlants: extra.map((r, j) => (j === i ? { ...r, capacityUnit: e.target.value } : r)),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-2">
                <div className="mb-1 text-xs font-medium text-muted">Its treatment units</div>
                <StringList
                  rows={pl.units ?? []}
                  editable={editable}
                  placeholder="e.g. pH Correction Tank"
                  addLabel="Add unit"
                  onChange={(rows) =>
                    onChange({ additionalPlants: extra.map((r, j) => (j === i ? { ...r, units: rows } : r)) })
                  }
                />
              </div>
              {editable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => onChange({ additionalPlants: extra.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4 text-danger" /> Remove this plant
                </Button>
              )}
            </div>
          ))}
          {editable && extra.length === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ additionalPlants: [{ plantType: "ETP", capacityUnit: "KLD", units: [] }] })}
            >
              <Plus className="size-4" /> Add a second plant
            </Button>
          )}
        </Section>

        <Section title="Scope notes" count={doc.notes ? "set" : "empty"}>
          <p className="mb-2 text-xs text-muted">
            The numbered list printed under the charge table — what is and isn&apos;t included.
          </p>
          <Textarea
            className="min-h-48 text-sm"
            aria-label="AMC scope notes"
            value={doc.notes ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </Section>
      </CardContent>
    </Card>
  );
}

/**
 * The Service Proforma's two overridable fields. Both default to something sensible,
 * so this is only opened when the deal differs from the norm.
 */
export function ServiceSections({
  doc,
  onChange,
  editable,
  validityDays,
}: {
  doc: ServiceProposalData;
  onChange: (patch: Partial<ServiceProposalData>) => void;
  editable: boolean;
  validityDays: number;
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Proforma details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field
          label="Job description"
          hint="Becomes the service job's description when this proposal is won."
        >
          <Textarea
            className="min-h-24"
            value={doc.jobDescription ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ jobDescription: e.target.value })}
          />
        </Field>

        <Field
          label="Addressed to"
          hint="Leave blank to address it to the enquiry's own customer and site address. Their sample bills a section office rather than the plant."
        >
          <Textarea
            className="min-h-20"
            placeholder="The Assistant Engineer,&#10;PWD – Buildings (C & M) Section III,&#10;Krishnagiri."
            value={doc.addressedTo ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ addressedTo: e.target.value })}
          />
        </Field>

        <Field
          label="Declaration"
          hint={`Leave blank to print "This rate is valid for ${validityDays} days only." from the validity above.`}
        >
          <Input
            value={doc.declaration ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ declaration: e.target.value })}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

/** A simple editable list of strings — used for both plants' unit lists. */
function StringList({
  rows,
  editable,
  placeholder,
  addLabel,
  onChange,
}: {
  rows: string[];
  editable: boolean;
  placeholder: string;
  addLabel: string;
  onChange: (rows: string[]) => void;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <Input
            className="h-8 flex-1"
            aria-label={`${addLabel} ${i + 1}`}
            placeholder={placeholder}
            value={r}
            disabled={!editable}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {editable && (
            <button aria-label={`Remove item ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-4 text-danger" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <Button variant="ghost" size="sm" onClick={() => onChange([...rows, ""])}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      )}
    </>
  );
}

function Section({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-surface"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <span className="flex-1">{title}</span>
        {count && <span className="text-xs font-normal text-muted">{count}</span>}
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}
