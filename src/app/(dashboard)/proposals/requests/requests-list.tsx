"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Check, X, FileUp, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea, Field } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { displayProposalNumber } from "@/lib/domain/proposal-aging";
import { reviewProposalRequestAction } from "./actions";

export interface RequestRow {
  id: string;
  leadId: string;
  customerName: string;
  address: string;
  proposalType: string;
  technology: string | null;
  plantType: string | null;
  capacityValue: number | null;
  capacityUnit: string;
  notes: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  proposal: { id: string; number: string; status: string } | null;
}

const TABS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Waiting" },
  { key: "ACCEPTED", label: "Being prepared" },
  { key: "FULFILLED", label: "Ready" },
  { key: "REJECTED", label: "Declined" },
];

function statusBadge(status: string) {
  if (status === "FULFILLED") return { variant: "ok" as const, label: "Ready" };
  if (status === "REJECTED") return { variant: "danger" as const, label: "Declined" };
  if (status === "ACCEPTED") return { variant: "primary" as const, label: "Being prepared" };
  return { variant: "warn" as const, label: "Waiting on office" };
}

export function RequestsList({
  initialItems,
  initialCursor,
  status,
  isAdmin,
}: {
  initialItems: RequestRow[];
  initialCursor: string | null;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  // Only the ADDITIONAL pages live in state; page 1 is read straight from props.
  //
  // The obvious `useState(initialItems)` is wrong HERE specifically: unlike the other
  // lists in this app, requests are created and actioned ON this page, so it calls
  // router.refresh() and gets fresh props — but a useState initializer only ever runs
  // on mount, so the freshly-created request would never appear (verified in-browser:
  // the row was in the DB and absent from the page). Same class as the v8 leads-list
  // bug, which was papered over with a `key` — that trick can't work when the key
  // wouldn't change. Deriving page 1 from props keeps refresh honest.
  const [more, setMore] = useState<{ items: RequestRow[]; cursor: string | null }>({
    items: [],
    cursor: null,
  });
  const items = [...initialItems, ...more.items];
  const cursor = more.items.length > 0 ? more.cursor : initialCursor;
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState<RequestRow | null>(null);
  const [pending, start] = useTransition();

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ cursor, take: "50" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/proposal-requests?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: RequestRow[]; nextCursor: string | null } = await res.json();
      setMore((p) => ({ items: [...p.items, ...data.items], cursor: data.nextCursor }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load more", "error");
    } finally {
      setLoading(false);
    }
  }

  function review(id: string, next: "ACCEPTED" | "REJECTED", reason?: string) {
    start(async () => {
      try {
        await reviewProposalRequestAction(id, next, reason);
        toast(next === "ACCEPTED" ? "Accepted — marked as being prepared." : "Request declined.");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "error");
      }
    });
  }

  /** Opens the creation wizard prefilled from the request, rather than creating a
   *  proposal blind — the admin still has to enter the design basis and pricing. */
  function createProposal(r: RequestRow) {
    router.push(`/proposals/new?request=${r.id}`);
  }

  const tabHref = (key: string) => (key ? `/proposals/requests?status=${key}` : "/proposals/requests");

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = (t.key === "" && !status) || status === t.key;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={isAdmin ? "No proposal requests in this view" : "You haven't requested any proposals yet"}
          description={
            isAdmin
              ? "Requests raised by the field team land here."
              : "Use “Request a proposal” above and the office will prepare the document."
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const badge = statusBadge(r.status);
            return (
              <Card key={r.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <span className="text-xs font-medium text-muted">{r.proposalType}</span>
                      {r.technology && <span className="text-xs text-muted">· {r.technology}</span>}
                    </div>
                    <Link href={`/leads/${r.leadId}`} className="mt-0.5 block truncate font-medium hover:underline">
                      {r.customerName}
                    </Link>
                    <div className="text-xs text-muted">
                      {[
                        r.plantType,
                        r.capacityValue ? `${r.capacityValue} ${r.capacityUnit}` : null,
                        r.address,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {r.notes && <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg/80">{r.notes}</p>}
                    {r.rejectionReason && (
                      <p className="mt-1.5 text-sm text-danger">Declined: {r.rejectionReason}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] text-muted">
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </span>
                    {/* The proposal link only appears once it exists AND the viewer can
                        open it — an employee's link would 404 on an unconfirmed draft,
                        so it's shown as "being finalised" until the office confirms. */}
                    {r.proposal &&
                      (isAdmin || r.proposal.status !== "DRAFT" ? (
                        <Link href={`/proposals/${r.proposal.id}`}>
                          <Badge variant="ok">
                            {displayProposalNumber(r.proposal.status, r.proposal.number)}
                            <ArrowRight className="size-3" />
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted">Being finalised by the office</span>
                      ))}

                    {isAdmin && r.status === "PENDING" && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => review(r.id, "ACCEPTED")}>
                          <Check className="size-3.5" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(r)}>
                          <X className="size-3.5" /> Decline
                        </Button>
                      </div>
                    )}
                    {isAdmin && (r.status === "PENDING" || r.status === "ACCEPTED") && (
                      <Button size="sm" disabled={pending} onClick={() => createProposal(r)}>
                        <FileUp className="size-3.5" /> Create proposal
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {cursor && (
            <div className="pt-2 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}

      <RejectDialog
        request={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => {
          const r = rejecting;
          setRejecting(null);
          if (r) review(r.id, "REJECTED", reason);
        }}
      />
    </div>
  );
}

/** A decline always carries a reason — that's the half the requester actually needs. */
function RejectDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: RequestRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={!!request}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title="Decline this request"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {request?.customerName} · {request?.proposalType}
        </p>
        <Field label="Why?" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. capacity not confirmed yet — get the headcount and water usage first"
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Decline request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
