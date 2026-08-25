"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { PROPOSAL_TYPES, PROPOSAL_TYPE_HINTS, TECHNOLOGY_ONE_LINERS } from "@/lib/constants";
import { PROJECT_REPORT_TECHNOLOGIES } from "@/lib/project-report-templates";
import { convertLeadAction } from "../actions";
import { createProposalRequestAction } from "../../proposals/requests/actions";

/**
 * The quote entry point on a lead, which is now role-split:
 *
 * - **ADMIN** creates the proposal directly, choosing which of the four document
 *   formats to produce (and, for a Project Proposal, the technology). Both paths
 *   into a proposal — this and the request queue — call the same
 *   `convertToProposal`, so they can't drift.
 * - **EMPLOYEE** raises a request instead. The office writes the document; it comes
 *   back to them once it's confirmed.
 *
 * A lead can be quoted once per type, so this stays available after the first
 * proposal (the old button disappeared forever once a lead hit CONVERTED).
 */
export function ConvertButton({
  leadId,
  isAdmin,
  leadTechnology,
  existingTypes,
}: {
  leadId: string;
  isAdmin: boolean;
  leadTechnology: string | null;
  /** Proposal types this lead already has — those options are disabled, since a
   *  second one of the same type is a duplicate rather than a new document. */
  existingTypes: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [proposalType, setProposalType] = useState<(typeof PROPOSAL_TYPES)[number]>("Project Proposal");
  // Restricted to the four technologies that HAVE a Project Report document. A lead
  // sized as SAFF/DAF falls back to MBBR *as a visible selection the admin can change*,
  // rather than being recorded as SAFF with another technology's content seeded.
  const [technology, setTechnology] = useState<(typeof PROJECT_REPORT_TECHNOLOGIES)[number]>(
    PROJECT_REPORT_TECHNOLOGIES.includes(leadTechnology as never)
      ? (leadTechnology as (typeof PROJECT_REPORT_TECHNOLOGIES)[number])
      : "MBBR",
  );
  const [notes, setNotes] = useState("");

  const needsTechnology = proposalType === "Project Proposal";
  const alreadyExists = existingTypes.includes(proposalType);

  function submit() {
    start(async () => {
      try {
        if (isAdmin) {
          const res = await convertLeadAction(leadId, {
            proposalType,
            technology: needsTechnology ? technology : undefined,
          });
          router.push(`/proposals/${res.proposalId}`);
        } else {
          await createProposalRequestAction({
            leadId,
            proposalType,
            technology: needsTechnology ? technology : undefined,
            notes: notes.trim() || undefined,
          });
          toast("Request sent to the office.");
          setOpen(false);
          router.refresh();
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not continue", "error");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="subtle">
        {isAdmin ? (
          <>
            <FileUp className="size-4" /> Create proposal
          </>
        ) : (
          <>
            <Send className="size-4" /> Request a proposal
          </>
        )}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={isAdmin ? "Create a proposal" : "Request a proposal from the office"}
      >
        <div className="space-y-3">
          <Field label="Kind of proposal" required hint={PROPOSAL_TYPE_HINTS[proposalType]}>
            <Select
              value={proposalType}
              onChange={(e) => setProposalType(e.target.value as (typeof PROPOSAL_TYPES)[number])}
              autoFocus
            >
              {PROPOSAL_TYPES.map((t) => (
                <option key={t} value={t} disabled={existingTypes.includes(t)}>
                  {t}
                  {existingTypes.includes(t) ? " — already quoted" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {needsTechnology && (
            <Field label="Technology" hint={TECHNOLOGY_ONE_LINERS[technology]}>
              <Select
                value={technology}
                onChange={(e) => setTechnology(e.target.value as (typeof PROJECT_REPORT_TECHNOLOGIES)[number])}
              >
                {PROJECT_REPORT_TECHNOLOGIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {!isAdmin && (
            <Field
              label="What did the customer ask for?"
              hint="Anything the office needs — site constraints, timeline, what was said on the call."
            >
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 120-flat apartment, treated water for gardening, decision this month"
              />
            </Field>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || alreadyExists} onClick={submit}>
              {pending
                ? isAdmin
                  ? "Creating…"
                  : "Sending…"
                : isAdmin
                  ? "Create proposal"
                  : "Send request"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
