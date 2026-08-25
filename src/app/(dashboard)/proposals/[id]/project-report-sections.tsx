"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { computeCapacity, type ProjectReportData } from "@/lib/domain/proposal-document";

/**
 * The Project Report's engineered content, editable per proposal.
 *
 * Everything here is seeded from the per-technology template at creation and is then
 * this proposal's own copy — editing it never touches the template, and a later
 * template revision never rewrites a quote already sent.
 *
 * Its own component rather than more sections inside proposal-editor.tsx, which is
 * already ~1,600 lines. The editor owns the state and the save; this is presentation.
 *
 * Sections are collapsed by default: for a 30 KLD plant this is ~16 equipment rows,
 * ~15 specification blocks and 6 process descriptions — expanded inline it would bury
 * the BOQ and the action buttons the admin actually came for.
 */
export function ProjectReportSections({
  doc,
  onChange,
  editable,
}: {
  doc: ProjectReportData;
  onChange: (patch: Partial<ProjectReportData>) => void;
  editable: boolean;
}) {
  const capacity = computeCapacity(doc.capacityCalc);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Project Report content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted">
          The engineered sections of this document. Filled in from the standard format when the
          proposal was created — edit anything here and it applies to this proposal only.
        </p>

        {/* ---- Design basis ---- */}
        <Section title="Design basis" count={capacity.designCapacityKLD ? `${capacity.designCapacityKLD} KLD` : "not set"}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Number of people" hint="Across all shifts">
              <Input
                type="number"
                disabled={!editable}
                value={doc.capacityCalc?.people ?? ""}
                onChange={(e) =>
                  onChange({
                    capacityCalc: { ...doc.capacityCalc, people: e.target.value ? Number(e.target.value) : undefined },
                  })
                }
              />
            </Field>
            <Field label="Water usage per head" hint="Litres per day">
              <Input
                type="number"
                disabled={!editable}
                value={doc.capacityCalc?.usagePerHead ?? ""}
                onChange={(e) =>
                  onChange({
                    capacityCalc: {
                      ...doc.capacityCalc,
                      usagePerHead: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </Field>
            <Field label="Factor of safety" hint="Extra litres per day">
              <Input
                type="number"
                disabled={!editable}
                value={doc.capacityCalc?.factorOfSafety ?? ""}
                onChange={(e) =>
                  onChange({
                    capacityCalc: {
                      ...doc.capacityCalc,
                      factorOfSafety: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </Field>
          </div>
          <div className="mt-2 rounded-lg bg-surface p-2.5 text-sm">
            <Row label="Sewage generated per day" value={`${capacity.sewagePerDay.toLocaleString("en-IN")} litres`} />
            <Row
              label="Total design capacity"
              value={`${capacity.designCapacityLPD.toLocaleString("en-IN")} litres per day ≈ ${capacity.designCapacityKLD} KLD`}
              bold
            />
          </div>
        </Section>

        {/* ---- Water quality ---- */}
        <Section title="Inlet & outlet parameters" count={`${(doc.inletParameters ?? []).length} / ${(doc.outletParameters ?? []).length}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterTable
              heading="Expected inlet"
              rows={doc.inletParameters ?? []}
              editable={editable}
              onChange={(inletParameters) => onChange({ inletParameters })}
            />
            <ParameterTable
              heading="Anticipated final water quality"
              rows={doc.outletParameters ?? []}
              editable={editable}
              onChange={(outletParameters) => onChange({ outletParameters })}
            />
          </div>
        </Section>

        {/* ---- Technology recommendation ---- */}
        <Section title="Technology recommendation" count={doc.recommendation ? "set" : "empty"}>
          {editable ? (
            <Textarea
              className="min-h-28 text-sm"
              value={doc.recommendation ?? ""}
              onChange={(e) => onChange({ recommendation: e.target.value })}
              placeholder="Why this technology was chosen for this plant…"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{doc.recommendation || "—"}</p>
          )}
        </Section>

        {/* ---- Process flow ---- */}
        <Section title="Process flow chart" count={`${(doc.flowChart ?? []).length} stages`}>
          <div className="space-y-1.5">
            {(doc.flowChart ?? []).map((node, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                <Input
                  className="h-8"
                  disabled={!editable}
                  aria-label={`Flow stage ${i + 1}`}
                  value={node}
                  onChange={(e) =>
                    onChange({ flowChart: (doc.flowChart ?? []).map((n, j) => (j === i ? e.target.value : n)) })
                  }
                />
                {editable && (
                  <button
                    aria-label={`Remove flow stage ${i + 1}`}
                    onClick={() => onChange({ flowChart: (doc.flowChart ?? []).filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onChange({ flowChart: [...(doc.flowChart ?? []), ""] })}
            >
              <Plus className="size-4" /> Add stage
            </Button>
          )}
        </Section>

        {/* ---- Process descriptions ---- */}
        <Section title="Details of process" count={`${(doc.processUnits ?? []).length} units`}>
          <div className="space-y-3">
            {(doc.processUnits ?? []).map((u, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Input
                    className="h-8 font-medium"
                    disabled={!editable}
                    aria-label={`Process unit ${i + 1} name`}
                    value={u.unit}
                    onChange={(e) =>
                      onChange({
                        processUnits: (doc.processUnits ?? []).map((x, j) =>
                          j === i ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  {editable && (
                    <button
                      aria-label={`Remove process unit ${i + 1}`}
                      onClick={() =>
                        onChange({ processUnits: (doc.processUnits ?? []).filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 className="size-4 text-danger" />
                    </button>
                  )}
                </div>
                <Textarea
                  className="min-h-20 text-sm"
                  disabled={!editable}
                  aria-label={`Process unit ${i + 1} description`}
                  value={u.body}
                  onChange={(e) =>
                    onChange({
                      processUnits: (doc.processUnits ?? []).map((x, j) =>
                        j === i ? { ...x, body: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onChange({ processUnits: [...(doc.processUnits ?? []), { unit: "", body: "" }] })}
            >
              <Plus className="size-4" /> Add process unit
            </Button>
          )}
        </Section>

        {/* ---- Equipment ---- */}
        <Section title="Machinery & equipment" count={`${(doc.equipment ?? []).length} rows`}>
          <Table>
            <THead>
              <TR className="border-t-0">
                <TH>Name</TH>
                <TH className="w-40">Quantity</TH>
                {editable && <TH className="w-10"></TH>}
              </TR>
            </THead>
            <TBody>
              {(doc.equipment ?? []).map((e, i) => (
                <TR key={i}>
                  <TD>
                    <Input
                      className="h-8"
                      disabled={!editable}
                      aria-label={`Equipment ${i + 1} name`}
                      value={e.name}
                      onChange={(ev) =>
                        onChange({
                          equipment: (doc.equipment ?? []).map((x, j) =>
                            j === i ? { ...x, name: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </TD>
                  <TD>
                    <Input
                      className="h-8"
                      disabled={!editable}
                      aria-label={`Equipment ${i + 1} quantity`}
                      value={e.quantity}
                      onChange={(ev) =>
                        onChange({
                          equipment: (doc.equipment ?? []).map((x, j) =>
                            j === i ? { ...x, quantity: ev.target.value } : x,
                          ),
                        })
                      }
                    />
                  </TD>
                  {editable && (
                    <TD>
                      <button
                        aria-label={`Remove equipment row ${i + 1}`}
                        onClick={() => onChange({ equipment: (doc.equipment ?? []).filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-4 text-danger" />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onChange({ equipment: [...(doc.equipment ?? []), { name: "", quantity: "" }] })}
            >
              <Plus className="size-4" /> Add equipment
            </Button>
          )}
        </Section>

        {/* ---- Material specifications ---- */}
        <Section title="Materials specification" count={`${(doc.materialSpecs ?? []).length} items`}>
          <div className="space-y-3">
            {(doc.materialSpecs ?? []).map((m, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Input
                    className="h-8 font-medium"
                    disabled={!editable}
                    aria-label={`Specification ${i + 1} title`}
                    value={m.title}
                    onChange={(e) =>
                      onChange({
                        materialSpecs: (doc.materialSpecs ?? []).map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  {editable && (
                    <button
                      aria-label={`Remove specification ${i + 1}`}
                      onClick={() =>
                        onChange({ materialSpecs: (doc.materialSpecs ?? []).filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 className="size-4 text-danger" />
                    </button>
                  )}
                </div>
                {/* One spec line per row — this is where a pump's make/model is changed. */}
                <Textarea
                  className="min-h-20 font-mono text-xs"
                  disabled={!editable}
                  aria-label={`Specification ${i + 1} lines`}
                  value={m.lines.join("\n")}
                  onChange={(e) =>
                    onChange({
                      materialSpecs: (doc.materialSpecs ?? []).map((x, j) =>
                        j === i ? { ...x, lines: e.target.value.split("\n") } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onChange({ materialSpecs: [...(doc.materialSpecs ?? []), { title: "", lines: [] }] })}
            >
              <Plus className="size-4" /> Add specification
            </Button>
          )}
        </Section>
      </CardContent>
    </Card>
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

function ParameterTable({
  heading,
  rows,
  editable,
  onChange,
}: {
  heading: string;
  rows: { parameter: string; value: string }[];
  editable: boolean;
  onChange: (rows: { parameter: string; value: string }[]) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{heading}</div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              className="h-8 w-24 shrink-0"
              disabled={!editable}
              aria-label={`${heading} parameter ${i + 1}`}
              value={r.parameter}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, parameter: e.target.value } : x)))}
            />
            <Input
              className="h-8"
              disabled={!editable}
              aria-label={`${heading} value ${i + 1}`}
              value={r.value}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            {editable && (
              <button
                aria-label={`Remove ${heading} row ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-danger" />
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => onChange([...rows, { parameter: "", value: "" }])}>
          <Plus className="size-4" /> Add
        </Button>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between gap-3 " + (bold ? "font-semibold" : "text-muted")}>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}
