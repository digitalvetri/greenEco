"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { ProjectReportBoilerplate } from "@/server/services/company-settings";
import { updateProposalDocumentAction } from "./actions";

/** The long-form sections, in the order they appear in the printed document. */
const SECTIONS: { key: keyof ProjectReportBoilerplate; label: string; hint: string }[] = [
  { key: "introduction", label: "Introduction", hint: "§4 — who Green Ecocare is. Appears in every Project Report." },
  { key: "plantAbout", label: "About the plant type", hint: "§5 — what an STP is and why it matters." },
  { key: "civilDesign", label: "Civil design", hint: "§7 — how the civil layout is arrived at." },
  { key: "mepDesign", label: "MEP design", hint: "§8 — the mechanical/electrical/plumbing approach." },
  { key: "taxesDuties", label: "Taxes & duties", hint: "§10.2 — including the works-contract sales tax note." },
  { key: "supplyErection", label: "Supply, erection & commissioning", hint: "§11 — delivery, erection, acceptance tests, 72-hour commissioning." },
  { key: "warranty", label: "Warranty", hint: "§12." },
  { key: "scopeGreenEcocare", label: "Scope of work — Green Ecocare", hint: "§13 — what we deliver." },
  { key: "scopeClient", label: "Scope of work — client", hint: "§14 — what the customer must provide." },
  { key: "pointsToNote", label: "Points to be noted", hint: "The numbered caveats at the end of the document." },
];

/**
 * Settings → Proposal document. The company-level half of the Project Report: the
 * sections that read the same on every quote regardless of technology.
 *
 * Same contract as the T&Cs template above it — blanking a field restores the shipped
 * default, so the office can always get back to the original wording. The
 * per-technology content (process descriptions, equipment, spec sheets, load tables)
 * is NOT here: it is fixed engineering content keyed to MBBR/SBR/ASP/MBR and lives in
 * the code, seeded into each proposal where it can be edited per-deal.
 */
export function ProposalDocumentCard({ doc }: { doc: ProjectReportBoilerplate }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState(doc);

  const set = <K extends keyof ProjectReportBoilerplate>(k: K, v: ProjectReportBoilerplate[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      const res = await updateProposalDocumentAction(f);
      if (res.ok) {
        toast("Proposal document updated.");
        setEditing(false);
        router.refresh();
      } else {
        toast(res.error ?? "Could not save", "error");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-3.5" /> Proposal document
          </span>
        </CardTitle>
        {!editing && (
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <p className="text-sm text-muted">
            The standard wording used in every Project Report — introduction, civil and MEP design,
            taxes, warranty, both scopes of work, and the points-to-note. Edit here to change it on all
            future proposals; the technology-specific engineering content is filled in per proposal.
          </p>
        ) : (
          <>
            {SECTIONS.map((s) => (
              <Field key={s.key} label={s.label} hint={s.hint}>
                <Textarea
                  className="min-h-24 text-sm"
                  value={(f[s.key] as string) ?? ""}
                  onChange={(e) => set(s.key, e.target.value as never)}
                  placeholder="Leave blank to use the standard wording"
                />
              </Field>
            ))}

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
              <Field label="Signatory name">
                <Input value={f.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} />
              </Field>
              <Field label="Designation">
                <Input value={f.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />
              </Field>
              <Field label="Signatory phone">
                <Input value={f.signatoryPhone} onChange={(e) => set("signatoryPhone", e.target.value)} />
              </Field>
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Recent completed projects</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set("recentProjects", [
                      ...f.recentProjects,
                      { client: "", project: "", plant: "", technology: "", capacity: "" },
                    ])
                  }
                >
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {f.recentProjects.map((p, i) => (
                  <div key={i} className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] gap-1.5">
                    {(["client", "project", "plant", "technology", "capacity"] as const).map((k) => (
                      <Input
                        key={k}
                        className="h-8"
                        aria-label={`${k} for recent project ${i + 1}`}
                        placeholder={k[0].toUpperCase() + k.slice(1)}
                        value={p[k]}
                        onChange={(e) =>
                          set(
                            "recentProjects",
                            f.recentProjects.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)),
                          )
                        }
                      />
                    ))}
                    <button
                      aria-label="Remove recent project"
                      onClick={() => set("recentProjects", f.recentProjects.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 border-t border-border pt-3">
              <Button size="sm" disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Save document"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setF(doc);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
