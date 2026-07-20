"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Plus, Trash2, Check, AlertTriangle, Pencil, X, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Field, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { SpeakButton } from "@/components/mobile/speak-button";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { formatINR } from "@/lib/money";
import { PLANT_TYPES, TECHNOLOGIES, BOQ_CATEGORIES, BOQ_UNITS, LOST_REASONS } from "@/lib/constants";
import { ProposalStageTracker } from "./proposal-stage-tracker";
import { ProposalTimeline } from "./proposal-timeline";
import { ProposalDocumentsCard } from "./proposal-documents-card";
import { SendProposalButtons } from "./send-proposal-button";
import type { ProposalEvent } from "@/server/services/proposal";
import {
  updateBasicsAction,
  saveVersionAction,
  generateTermsAction,
  approveSendAction,
  wonAction,
  lostAction,
  setProposalStatusAction,
} from "../actions";

interface BoqRow {
  id?: string;
  category: string;
  item: string;
  specification?: string | null;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
  aiSuggested: boolean;
}

/** Shape of a boqItems entry in the generate-stream route's `done` event payload. */
interface StreamedBoqLine {
  category: string;
  item: string;
  specification?: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface ProposalView {
  id: string;
  number: string;
  status: string;
  projectName: string;
  siteAddress: string;
  plantType: string;
  technology: string;
  capacityKLD: number;
  lostReason: string | null;
  order: { id: string; orderNo: string } | null;
  version: {
    versionNo: number;
    technicalText: string;
    coverLetter: string;
    pointsToNote: string;
    technologyExplainer: string;
    terms: string;
    technicalSpecs: TechSpecRow[];
    electricalLoad: ElectricalLoadRow[];
    aiGenerated: boolean;
    approved: boolean;
    subtotal: string;
    gstAmount: string;
    grandTotal: string;
    estimatedCost: string | null;
    validityDays: number;
    paymentTerms: Array<{ description: string; percent: number; trigger: string }>;
    boqItems: BoqRow[];
  } | null;
}

interface TechSpecRow {
  section: string;
  item: string;
  spec: string;
  qty: string;
}

interface ElectricalLoadRow {
  description: string;
  hp: number;
}

export function ProposalEditor({
  view,
  isAdmin,
  events,
  documents,
  standardTermsTemplate,
}: {
  view: ProposalView;
  isAdmin: boolean;
  events: ProposalEvent[];
  documents: { id: string; url: string; name: string }[];
  standardTermsTemplate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"proposal" | "activity" | "documents">("proposal");
  const locked = view.status === "WON" || view.status === "LOST";
  const editable = !locked && (isAdmin || view.status === "DRAFT");

  const [basics, setBasics] = useState({
    projectName: view.projectName,
    siteAddress: view.siteAddress,
    plantType: view.plantType,
    technology: view.technology,
    capacityKLD: view.capacityKLD,
  });
  const [boq, setBoq] = useState<BoqRow[]>(view.version?.boqItems ?? []);
  const [techText, setTechText] = useState(view.version?.technicalText ?? "");
  const [editingTech, setEditingTech] = useState(false);
  const [coverLetter, setCoverLetter] = useState(view.version?.coverLetter ?? "");
  const [pointsToNote, setPointsToNote] = useState(view.version?.pointsToNote ?? "");
  const [technologyExplainer, setTechnologyExplainer] = useState(view.version?.technologyExplainer ?? "");
  const [technicalSpecs, setTechnicalSpecs] = useState<TechSpecRow[]>(view.version?.technicalSpecs ?? []);
  const [electricalLoad, setElectricalLoad] = useState<ElectricalLoadRow[]>(view.version?.electricalLoad ?? []);
  const [tcs, setTcs] = useState(view.version?.terms ?? "");
  // Pre-fill from the sizing already captured on the lead, so the Generate button
  // isn't stuck disabled-with-no-explanation on a freshly-converted proposal — the
  // admin can still edit this before generating. Pre-P2 leads coalesce capacityKLD
  // to 0 (no real sizing was ever captured), so leave it blank in that case rather
  // than generate a nonsensical "0 KLD" description.
  const [aiDesc, setAiDesc] = useState(() =>
    view.capacityKLD > 0 ? `${view.plantType} ${view.capacityKLD} KLD using ${view.technology} at ${view.siteAddress}` : "",
  );
  const [estCost, setEstCost] = useState(view.version?.estimatedCost ?? "");
  const [terms, setTerms] = useState(view.version?.paymentTerms ?? []);
  const [validity, setValidity] = useState(view.version?.validityDays ?? 30);
  const [marginWarn, setMarginWarn] = useState<null | { requiredFloor: string }>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tailoringTerms, setTailoringTerms] = useState(false);
  const termsPct = terms.reduce((a, t) => a + (Number(t.percent) || 0), 0);

  const subtotal = boq.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const gst = Math.round(subtotal * 18) / 100;
  const grand = subtotal + gst;

  function run(fn: () => Promise<unknown>, ok?: string) {
    startTransition(async () => {
      try {
        await fn();
        if (ok) toast(ok);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "error");
      }
    });
  }

  function editRow(i: number, patch: Partial<BoqRow>) {
    setBoq((rows) =>
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch, aiSuggested: false };
        const qty = Number(next.qty) || 0;
        const rate = Number(next.rate) || 0;
        next.amount = (Math.round(qty * rate * 100) / 100).toString();
        return next;
      }),
    );
  }

  function saveBoq() {
    run(
      () =>
        saveVersionAction(view.id, {
          boqItems: boq.map((r) => ({
            category: r.category,
            item: r.item,
            specification: r.specification ?? undefined,
            unit: r.unit,
            qty: Number(r.qty),
            rate: Number(r.rate),
            amount: Number(r.amount),
            aiSuggested: r.aiSuggested,
          })),
          estimatedCost: isAdmin && estCost ? Number(estCost) : undefined,
          paymentTerms: terms,
          validityDays: Number(validity) || 30,
          coverLetter,
          pointsToNote,
          technologyExplainer,
          technicalSpecs: technicalSpecs as never,
          electricalLoad: electricalLoad as never,
          terms: tcs,
        }),
      "Saved.",
    );
  }

  /** SSE draft generation — parses `event: <name>\ndata: <json>\n\n` frames off the
   *  response body as they arrive, growing techText live (word-by-word). */
  async function handleGenerate() {
    setIsGenerating(true);
    setTechText("");
    try {
      const res = await fetch(`/api/proposals/${view.id}/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aiDesc,
          capacityKLD: basics.capacityKLD || undefined,
          technology: basics.technology,
          plantType: basics.plantType,
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Generation failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice("event: ".length);
          const data = JSON.parse(dataLine.slice("data: ".length));
          if (event === "token") {
            setTechText((t) => t + data.text);
          } else if (event === "done") {
            finished = true;
            setBoq(
              ((data.boqItems ?? []) as StreamedBoqLine[]).map((b) => ({
                category: b.category, item: b.item, specification: b.specification ?? undefined,
                unit: b.unit, qty: String(b.qty), rate: String(b.rate), amount: String(b.amount),
                aiSuggested: true,
              })),
            );
            setTerms(data.paymentTerms ?? terms);
            if (data.coverLetter) setCoverLetter(data.coverLetter);
            if (data.pointsToNote) setPointsToNote(data.pointsToNote);
            if (data.technologyExplainer) setTechnologyExplainer(data.technologyExplainer);
            if (data.technicalSpecs) setTechnicalSpecs(data.technicalSpecs as TechSpecRow[]);
            if (data.electricalLoad) setElectricalLoad(data.electricalLoad as ElectricalLoadRow[]);
          } else if (event === "error") {
            throw new Error(data.message ?? "Generation failed");
          }
        }
      }
      if (finished) {
        toast("AI draft generated. Review the orange rows.");
        router.refresh(); // revalidates the version badge/timeline/aiGenerated flag
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally {
      setIsGenerating(false);
    }
  }

  const statusVariant =
    view.status === "WON" ? "ok" : view.status === "LOST" ? "danger" : "primary";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={view.projectName || "Proposal"}
        subtitle={view.number}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/print/proposal/${view.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Printer className="size-3.5" /> Print
            </a>
            <DownloadPdfButton docType="proposal" docId={view.id} />
            <Badge variant={statusVariant}>{view.status.replace(/_/g, " ")}</Badge>
            {view.order && (
              <Link href={`/projects/${view.order.id}`}>
                <Badge variant="ok">→ {view.order.orderNo}</Badge>
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <ProposalStageTracker status={view.status} />
      </div>

      {/* Quick action bar — secondary actions near the top for easy access */}
      {isAdmin && !locked && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
          {(view.status === "SENT" || view.status === "UNDER_NEGOTIATION") && (
            <SendProposalButtons proposalId={view.id} />
          )}
          {view.status === "SENT" && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setProposalStatusAction(view.id, "UNDER_NEGOTIATION"), "Moved to negotiation.")}
            >
              Mark Negotiation
            </Button>
          )}
          {view.status === "UNDER_NEGOTIATION" && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setProposalStatusAction(view.id, "SENT"), "Back to sent.")}
            >
              Back to Sent
            </Button>
          )}
          <MarkLostButton id={view.id} run={run} />
        </div>
      )}

      <Tabs
        className="mb-4"
        active={tab}
        onChange={(k) => setTab(k as "proposal" | "activity" | "documents")}
        items={[
          { key: "proposal", label: "Proposal" },
          { key: "activity", label: "Activity", count: events.length },
          { key: "documents", label: "Documents", count: documents.length },
        ]}
      />

      {tab === "activity" && <ProposalTimeline events={events} />}
      {tab === "documents" && <ProposalDocumentsCard proposalId={view.id} documents={documents} />}

      {tab === "proposal" && (
        <>
      {/* Basics */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Project name">
                <Input
                  value={basics.projectName}
                  disabled={!isAdmin}
                  onChange={(e) => setBasics({ ...basics, projectName: e.target.value })}
                />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Site address">
                <Input
                  value={basics.siteAddress}
                  disabled={!isAdmin}
                  onChange={(e) => setBasics({ ...basics, siteAddress: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Plant type">
              <Select
                value={basics.plantType}
                disabled={!isAdmin}
                onChange={(e) => setBasics({ ...basics, plantType: e.target.value })}
              >
                {PLANT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Technology">
              <Select
                value={basics.technology}
                disabled={!isAdmin}
                onChange={(e) => setBasics({ ...basics, technology: e.target.value })}
              >
                {TECHNOLOGIES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Capacity (KLD)">
              <Input
                type="number"
                value={basics.capacityKLD}
                disabled={!isAdmin}
                onChange={(e) => setBasics({ ...basics, capacityKLD: Number(e.target.value) })}
              />
            </Field>
            {isAdmin && (
              <div className="col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => updateBasicsAction(view.id, basics), "Basics saved.")}
                >
                  Save basics
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI generate */}
      {editable && (
        <Card className="mb-4 border-primary/30">
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Sparkles className="size-4" /> AI Generate (draft — review before sending)
              </span>
              <SpeakButton onTranscript={(t) => setAiDesc(t)} />
            </div>
            <Textarea
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              placeholder="Describe the requirement (or Speak). e.g. STP 40 KLD for a 120-flat apartment, MBBR, reuse for gardening"
            />
            <Button
              variant="subtle"
              size="sm"
              disabled={pending || isGenerating || !aiDesc}
              onClick={handleGenerate}
            >
              <Sparkles className="size-4" /> {isGenerating ? "Generating…" : "Generate BOQ + write-up"}
            </Button>
            {!aiDesc && !pending && !isGenerating && (
              <p className="text-xs text-muted">Type a description above (or tap the mic) to enable this.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cover letter */}
      {(coverLetter || editable) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Cover Letter</CardTitle>
          </CardHeader>
          <CardContent>
            {editable ? (
              <Textarea
                className="min-h-32"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Greeting / intro letter to the client…"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{coverLetter}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Technical write-up */}
      {(techText || editable) && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Technical Write-up{view.version?.aiGenerated && <span className="ml-1.5 text-xs font-normal text-primary">(AI)</span>}
              </CardTitle>
              {isAdmin && !editingTech && (
                <button
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface"
                  onClick={() => setEditingTech(true)}
                >
                  <Pencil className="size-3" /> Edit
                </button>
              )}
              {isAdmin && editingTech && (
                <button
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface"
                  onClick={() => { setTechText(view.version?.technicalText ?? ""); setEditingTech(false); }}
                >
                  <X className="size-3" /> Cancel
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating && !techText ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Sparkles className="size-3.5 animate-pulse" /> Generating Technical Write-up…
                </div>
                {[80, 100, 65, 90, 75].map((w, i) => (
                  <div key={i} className={`h-3.5 animate-pulse rounded bg-surface`} style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : isGenerating ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {techText}
                <span className="animate-pulse text-primary">▍</span>
              </div>
            ) : editingTech ? (
              <div className="space-y-3">
                <Textarea
                  className="min-h-48 font-mono text-xs"
                  value={techText}
                  onChange={(e) => setTechText(e.target.value)}
                  placeholder="Technical description of the proposed plant…"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await saveVersionAction(view.id, {
                            boqItems: boq.map((r) => ({
                              category: r.category, item: r.item,
                              specification: r.specification ?? undefined,
                              unit: r.unit, qty: Number(r.qty), rate: Number(r.rate),
                              amount: Number(r.amount), aiSuggested: r.aiSuggested,
                            })),
                            technicalText: techText,
                            estimatedCost: isAdmin && estCost ? Number(estCost) : undefined,
                            paymentTerms: terms,
                            validityDays: Number(validity) || 30,
                          });
                          toast("Write-up saved.");
                          setEditingTech(false);
                          router.refresh();
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Save failed", "error");
                        }
                      });
                    }}
                  >
                    Save write-up
                  </Button>
                </div>
              </div>
            ) : (
              <TechnicalWriteUp text={techText} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Technology explainer + points to note */}
      {(technologyExplainer || pointsToNote || editable) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>How This Technology Works &amp; Points to Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label={`About ${basics.technology}`}>
              {editable ? (
                <Textarea
                  className="min-h-24"
                  value={technologyExplainer}
                  onChange={(e) => setTechnologyExplainer(e.target.value)}
                  placeholder="How this technology works…"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{technologyExplainer}</p>
              )}
            </Field>
            <Field label="Points to note">
              {editable ? (
                <Textarea
                  className="min-h-24"
                  value={pointsToNote}
                  onChange={(e) => setPointsToNote(e.target.value)}
                  placeholder="One caveat/callout per line, e.g. GST extra, civil work by client…"
                />
              ) : (
                <ul className="space-y-1 text-sm text-foreground/90">
                  {pointsToNote.split("\n").filter(Boolean).map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50" />
                      <span>{line.replace(/^[-•]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </CardContent>
        </Card>
      )}

      {/* Technical specifications + electrical load */}
      {(technicalSpecs.length > 0 || electricalLoad.length > 0 || editable) && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Technical Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR className="border-t-0">
                  <TH>Section</TH>
                  <TH>Item</TH>
                  <TH>Specification</TH>
                  <TH className="text-right">Qty</TH>
                  {editable && <TH></TH>}
                </TR>
              </THead>
              <TBody>
                {technicalSpecs.map((r, i) => (
                  <TR key={i}>
                    <TD>
                      {editable ? (
                        <Input
                          className="h-8"
                          value={r.section}
                          onChange={(e) =>
                            setTechnicalSpecs((rows) => rows.map((x, j) => (j === i ? { ...x, section: e.target.value } : x)))
                          }
                        />
                      ) : (
                        r.section
                      )}
                    </TD>
                    <TD>
                      {editable ? (
                        <Input
                          className="h-8"
                          value={r.item}
                          onChange={(e) =>
                            setTechnicalSpecs((rows) => rows.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))
                          }
                        />
                      ) : (
                        r.item
                      )}
                    </TD>
                    <TD>
                      {editable ? (
                        <Input
                          className="h-8"
                          value={r.spec}
                          onChange={(e) =>
                            setTechnicalSpecs((rows) => rows.map((x, j) => (j === i ? { ...x, spec: e.target.value } : x)))
                          }
                        />
                      ) : (
                        r.spec
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {editable ? (
                        <Input
                          className="h-8 w-20 text-right"
                          value={r.qty}
                          onChange={(e) =>
                            setTechnicalSpecs((rows) => rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                          }
                        />
                      ) : (
                        r.qty
                      )}
                    </TD>
                    {editable && (
                      <TD>
                        <button
                          aria-label="Remove spec row"
                          onClick={() => setTechnicalSpecs((rows) => rows.filter((_, j) => j !== i))}
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
                onClick={() =>
                  setTechnicalSpecs((rows) => [...rows, { section: "Others", item: "", spec: "", qty: "" }])
                }
              >
                <Plus className="size-4" /> Add spec line
              </Button>
            )}

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Electrical Load Summary</span>
                {electricalLoad.length > 0 && (
                  <span className="text-xs tabular-nums text-muted">
                    Total {electricalLoad.reduce((a, l) => a + (Number(l.hp) || 0), 0)} HP
                  </span>
                )}
              </div>
              <Table>
                <THead>
                  <TR className="border-t-0">
                    <TH>Description</TH>
                    <TH className="text-right">HP</TH>
                    {editable && <TH></TH>}
                  </TR>
                </THead>
                <TBody>
                  {electricalLoad.map((r, i) => (
                    <TR key={i}>
                      <TD>
                        {editable ? (
                          <Input
                            className="h-8"
                            value={r.description}
                            onChange={(e) =>
                              setElectricalLoad((rows) => rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                            }
                          />
                        ) : (
                          r.description
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {editable ? (
                          <Input
                            className="h-8 w-20 text-right"
                            type="number"
                            value={r.hp}
                            onChange={(e) =>
                              setElectricalLoad((rows) => rows.map((x, j) => (j === i ? { ...x, hp: Number(e.target.value) } : x)))
                            }
                          />
                        ) : (
                          r.hp
                        )}
                      </TD>
                      {editable && (
                        <TD>
                          <button
                            aria-label="Remove load row"
                            onClick={() => setElectricalLoad((rows) => rows.filter((_, j) => j !== i))}
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
                  onClick={() => setElectricalLoad((rows) => [...rows, { description: "", hp: 0 }])}
                >
                  <Plus className="size-4" /> Add load line
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* BOQ */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Bill of Quantities</CardTitle>
        </CardHeader>
        <CardContent>
          {boq.some((r) => r.aiSuggested) && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-1.5 text-xs text-primary">
              <Sparkles className="size-3.5" /> AI-suggested — review every line before sending
            </div>
          )}
          {isGenerating ? (
            <div className="space-y-2 py-2">
              <div className="flex items-center gap-2 text-xs text-primary">
                <Sparkles className="size-3.5 animate-pulse" /> Generating BOQ…
              </div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-8 flex-1 animate-pulse rounded bg-surface" />
                  <div className="h-8 w-16 animate-pulse rounded bg-surface" />
                  <div className="h-8 w-16 animate-pulse rounded bg-surface" />
                  <div className="h-8 w-20 animate-pulse rounded bg-surface" />
                  <div className="h-8 w-24 animate-pulse rounded bg-surface" />
                </div>
              ))}
            </div>
          ) : (
          <>
          <Table>
            <THead>
              <TR className="border-t-0">
                <TH>Item</TH>
                <TH>Cat</TH>
                <TH>Unit</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Rate ₹</TH>
                <TH className="text-right">Amount</TH>
                {editable && <TH></TH>}
              </TR>
            </THead>
            <TBody>
              {boq.map((r, i) => (
                <TR key={i}>
                  <TD>
                    {editable ? (
                      <Input
                        className="h-8"
                        value={r.item}
                        onChange={(e) => editRow(i, { item: e.target.value })}
                      />
                    ) : (
                      <span>{r.item}</span>
                    )}
                  </TD>
                  <TD className="text-xs text-muted">
                    {editable ? (
                      <Select
                        className="h-8 w-24"
                        value={r.category}
                        onChange={(e) => editRow(i, { category: e.target.value })}
                      >
                        {BOQ_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    ) : (
                      r.category
                    )}
                  </TD>
                  <TD>
                    {editable ? (
                      <Select
                        className="h-8 w-24"
                        value={r.unit}
                        onChange={(e) => editRow(i, { unit: e.target.value })}
                      >
                        {BOQ_UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </Select>
                    ) : (
                      r.unit
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {editable ? (
                      <Input
                        className="h-8 w-16 text-right"
                        value={r.qty}
                        onChange={(e) => editRow(i, { qty: e.target.value })}
                      />
                    ) : (
                      r.qty
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {editable ? (
                      <Input
                        className="h-8 w-20 text-right"
                        value={r.rate}
                        onChange={(e) => editRow(i, { rate: e.target.value })}
                      />
                    ) : (
                      r.rate
                    )}
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {formatINR(r.amount || 0)}
                  </TD>
                  {editable && (
                    <TD>
                      <button onClick={() => setBoq(boq.filter((_, j) => j !== i))} aria-label="Remove line">
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
              onClick={() =>
                setBoq([
                  ...boq,
                  {
                    category: "Others",
                    item: "",
                    unit: "Nos",
                    qty: "1",
                    rate: "0",
                    amount: "0",
                    aiSuggested: false,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          )}
          </>
          )}

          <div className="mt-3 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <Row label="GST @ 18%" value={formatINR(gst)} />
            <Row label="Grand Total" value={formatINR(grand)} bold />
            {isAdmin && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="mb-0">Est. cost (admin)</Label>
                <Input
                  className="h-8 w-32"
                  value={estCost}
                  disabled={!editable}
                  onChange={(e) => setEstCost(e.target.value)}
                  placeholder="margin guard"
                />
                {estCost && Number(estCost) > 0 && (
                  <span className="text-xs text-muted">
                    Margin {(((grand - Number(estCost)) / grand) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Payment terms — always editable by admin, even on WON/LOST proposals. */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Payment terms</span>
              <span className={`text-xs tabular-nums ${termsPct === 100 ? "text-ok" : "text-warn"}`}>
                {termsPct}% {termsPct === 100 ? "" : "(should total 100%)"}
              </span>
            </div>
            <div className="space-y-2">
              {terms.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_9rem_auto] gap-2">
                  <Input
                    placeholder="Milestone (e.g. Advance on order)"
                    value={t.description}
                    disabled={!isAdmin}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  />
                  <Input
                    type="number"
                    aria-label="Percent"
                    value={t.percent}
                    disabled={!isAdmin}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
                  />
                  <Select
                    value={t.trigger}
                    disabled={!isAdmin}
                    onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, trigger: e.target.value } : x)))}
                  >
                    <option value="DATE">On advance / date</option>
                    <option value="STAGE_COMPLETION">On stage completion</option>
                  </Select>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => setTerms((ts) => ts.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
              ))}
              {isAdmin && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setTerms((ts) => [...ts, { description: "", percent: 0, trigger: "STAGE_COMPLETION" }])}
                >
                  <Plus className="size-4" /> Add milestone
                </Button>
              )}
            </div>
            <div className="mt-3 max-w-[10rem]">
              <Field label="Validity (days)">
                <Input type="number" value={validity} disabled={!isAdmin} onChange={(e) => setValidity(Number(e.target.value))} />
              </Field>
            </div>
          </div>

          {/* Terms & Conditions — fixed template (Reset) or AI-tailored per deal. */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Terms &amp; Conditions</span>
              {editable && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTcs(standardTermsTemplate)}>
                    Reset to standard template
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={tailoringTerms}
                    onClick={() => {
                      setTailoringTerms(true);
                      generateTermsAction(view.id)
                        .then((res) => {
                          setTcs(res.text);
                          toast(res.source === "ai" ? "T&Cs tailored by AI." : "No AI provider configured — kept the standard template.");
                        })
                        .catch((e) => toast(e instanceof Error ? e.message : "Failed to tailor T&Cs", "error"))
                        .finally(() => setTailoringTerms(false));
                    }}
                  >
                    <Sparkles className="size-4" /> {tailoringTerms ? "Tailoring…" : "AI-tailor for this deal"}
                  </Button>
                </div>
              )}
            </div>
            {editable ? (
              <Textarea
                className="min-h-48 font-mono text-xs"
                value={tcs}
                onChange={(e) => setTcs(e.target.value)}
                placeholder="Standard terms & conditions…"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{tcs}</p>
            )}
          </div>

          {isAdmin && (
            <Button className="mt-3" disabled={pending} onClick={saveBoq}>
              {pending ? "Saving…" : "Save proposal"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Primary actions — approve / won */}
      {isAdmin && !locked && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-4">
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await approveSendAction(view.id);
                  if (res && "marginWarning" in res && res.marginWarning) {
                    setMarginWarn({ requiredFloor: res.marginWarning.requiredFloor });
                  } else {
                    toast("Approved & marked SENT.");
                  }
                })
              }
            >
              <Check className="size-4" /> Approve & Send
            </Button>
            {view.status !== "DRAFT" && view.version?.approved && (
              <Button
                variant="subtle"
                disabled={pending}
                onClick={() => run(() => wonAction(view.id), "Won — order created.")}
              >
                Mark Won → create Order
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reopen a lost proposal (the actions card is hidden once locked). */}
      {isAdmin && view.status === "LOST" && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <span className="text-sm text-danger">Lost: {view.lostReason}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setProposalStatusAction(view.id, "SENT"), "Reopened.")}
          >
            Reopen
          </Button>
        </div>
      )}
      {view.lostReason && view.status !== "LOST" && (
        <p className="mt-3 text-sm text-muted">Previously lost: {view.lostReason}</p>
      )}
        </>
      )}

      {marginWarn && (
        <MarginModal
          floor={marginWarn.requiredFloor}
          onClose={() => setMarginWarn(null)}
          onConfirm={(note) => {
            setMarginWarn(null);
            run(() => approveSendAction(view.id, note), "Approved with margin override.");
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-bold" : "text-muted")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function MarkLostButton({
  id,
  run,
}: {
  id: string;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Mark Lost
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mark proposal as lost">
        <div className="space-y-3">
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select a reason…</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any detail worth recording…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!reason}
              onClick={() => {
                setOpen(false);
                run(() => lostAction(id, note.trim() ? `${reason} — ${note.trim()}` : reason), "Marked lost.");
              }}
            >
              Mark lost
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * Renders the AI technical write-up in a polished, structured format.
 * Parses "Label: content" lines and multi-paragraph blocks into visual sections.
 */
function TechnicalWriteUp({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-sm text-muted italic">No technical write-up yet.</p>;

  // Split into paragraphs on blank lines
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="space-y-4 text-sm">
      {paragraphs.map((para, i) => {
        // Check if paragraph starts with a "Label:" pattern
        const labelMatch = para.match(/^([A-Za-z ]+):\s*([\s\S]+)$/);

        if (labelMatch) {
          const label = labelMatch[1].trim();
          const body = labelMatch[2].trim();
          // Check if body contains sub-items (comma-separated stages or bullet-like)
          const isStageList = body.includes(",") && body.length > 80;

          return (
            <div key={i} className="rounded-lg border border-border bg-surface/50 px-4 py-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">{label}</div>
              {isStageList ? (
                <ul className="space-y-1 text-foreground/90">
                  {body.split(/,\s*(?=[A-Z])/).map((item, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50" />
                      <span>{item.trim().replace(/\.$/, "")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="leading-relaxed text-foreground/90">{body}</p>
              )}
            </div>
          );
        }

        // First paragraph → summary banner
        if (i === 0) {
          return (
            <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="font-medium leading-relaxed text-foreground">{para}</p>
            </div>
          );
        }

        // Plain paragraph — same boxed treatment as a labelled one (minus the label),
        // so it doesn't float unstyled next to its bordered siblings.
        return (
          <div key={i} className="rounded-lg border border-border bg-surface/50 px-4 py-3">
            <p className="leading-relaxed text-foreground/90">{para}</p>
          </div>
        );
      })}
    </div>
  );
}

function MarginModal({
  floor,
  onClose,
  onConfirm,
}: {
  floor: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-w-sm">
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2 text-warn">
            <AlertTriangle className="size-5" />
            <span className="font-semibold">Below margin floor</span>
          </div>
          <p className="text-sm">
            Grand total is below the minimum margin floor of {formatINR(floor)}. A note is required
            to approve.
          </p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for low margin" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={!note} onClick={() => onConfirm(note)}>
              Approve anyway
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
