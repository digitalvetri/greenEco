"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  PROPOSAL_TYPES,
  TECHNOLOGIES,
  PLANT_TYPES,
  CAPACITY_UNITS,
  PROPOSAL_TYPE_HINTS,
  TECHNOLOGY_ONE_LINERS,
} from "@/lib/constants";
import { createProposalRequestAction } from "./actions";

export interface LeadOption {
  id: string;
  label: string;
  hint: string;
  plantType: string | null;
  technology: string | null;
  capacityValue: number | null;
  capacityUnit: string | null;
}

/**
 * "Ask the office for a proposal". Collapsed by default so the request LIST is what
 * you see first — an employee opens this page more often to check on a request than
 * to raise a new one.
 *
 * Technology is only asked for on a Project Proposal: that is the one type whose
 * document genuinely differs per technology (MBBR/SBR/ASP/MBR each have their own
 * process flow, equipment list and write-up). Asking for it on a BOQ or an AMC
 * proposal would be a field with no effect.
 */
export function RequestProposalCard({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    leadId: "",
    proposalType: "Project Proposal" as (typeof PROPOSAL_TYPES)[number],
    technology: "MBBR" as (typeof TECHNOLOGIES)[number],
    plantType: "STP" as (typeof PLANT_TYPES)[number],
    capacityValue: "",
    capacityUnit: "KLD" as (typeof CAPACITY_UNITS)[number],
    notes: "",
  });

  const needsTechnology = f.proposalType === "Project Proposal";

  /** Picking an enquiry pre-fills whatever sizing was already captured on it, so the
   *  employee confirms rather than re-types — and can still override. */
  function pickLead(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    setF((p) => ({
      ...p,
      leadId,
      plantType: (lead?.plantType as (typeof PLANT_TYPES)[number]) ?? p.plantType,
      technology: (lead?.technology as (typeof TECHNOLOGIES)[number]) ?? p.technology,
      capacityValue: lead?.capacityValue ? String(lead.capacityValue) : p.capacityValue,
      capacityUnit: (lead?.capacityUnit as (typeof CAPACITY_UNITS)[number]) ?? p.capacityUnit,
    }));
  }

  function submit() {
    if (!f.leadId) {
      toast("Pick which enquiry this is for", "error");
      return;
    }
    start(async () => {
      try {
        await createProposalRequestAction({
          leadId: f.leadId,
          proposalType: f.proposalType,
          technology: needsTechnology ? f.technology : undefined,
          plantType: f.plantType,
          capacityValue: f.capacityValue ? Number(f.capacityValue) : undefined,
          capacityUnit: f.capacityUnit,
          notes: f.notes.trim() || undefined,
        });
        toast("Request sent to the office.");
        setF((p) => ({ ...p, leadId: "", notes: "", capacityValue: "" }));
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not send the request", "error");
      }
    });
  }

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Need a proposal for an enquiry?</p>
            <p className="text-xs text-muted">
              Pick the enquiry and the kind of proposal you need — the office prepares the document and
              it appears here once it&apos;s ready.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Request a proposal
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Request a proposal</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Which enquiry?" required>
          <Select value={f.leadId} onChange={(e) => pickLead(e.target.value)} autoFocus>
            <option value="">Select an enquiry…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} — {l.hint}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind of proposal" required hint={PROPOSAL_TYPE_HINTS[f.proposalType]}>
            <Select
              value={f.proposalType}
              onChange={(e) =>
                setF({ ...f, proposalType: e.target.value as (typeof PROPOSAL_TYPES)[number] })
              }
            >
              {PROPOSAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          {needsTechnology && (
            <Field label="Technology" hint={TECHNOLOGY_ONE_LINERS[f.technology]}>
              <Select
                value={f.technology}
                onChange={(e) =>
                  setF({ ...f, technology: e.target.value as (typeof TECHNOLOGIES)[number] })
                }
              >
                {TECHNOLOGIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Plant type">
            <Select
              value={f.plantType}
              onChange={(e) => setF({ ...f, plantType: e.target.value as (typeof PLANT_TYPES)[number] })}
            >
              {PLANT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Capacity">
            <div className="flex gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                value={f.capacityValue}
                onChange={(e) => setF({ ...f, capacityValue: e.target.value })}
                placeholder="e.g. 30"
              />
              <Select
                className="w-32 shrink-0"
                value={f.capacityUnit}
                onChange={(e) =>
                  setF({ ...f, capacityUnit: e.target.value as (typeof CAPACITY_UNITS)[number] })
                }
              >
                {CAPACITY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>

        <Field
          label="What did the customer ask for?"
          hint="Anything the office needs to know — site constraints, timelines, what they said on the call."
        >
          <Textarea
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="e.g. 120-flat apartment, wants treated water for gardening, decision expected this month"
          />
        </Field>

        <Button disabled={pending} onClick={submit}>
          <Send className="size-4" /> {pending ? "Sending…" : "Send request to office"}
        </Button>
      </CardContent>
    </Card>
  );
}
