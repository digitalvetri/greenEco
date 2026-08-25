"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DraftingCompass,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  UserPlus,
  FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea, Field, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Uploader } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import {
  assignDrawingRequestAction,
  deliverDrawingAction,
  reviewDeliveryAction,
  cancelDrawingRequestAction,
  reopenDrawingRequestAction,
} from "./actions";

export interface DrawingRequestRow {
  id: string;
  title: string;
  discipline: string;
  purpose: string | null;
  notes: string | null;
  status: string;
  priority: string;
  changeReason: string | null;
  dueDate: string | null;
  overdue: boolean;
  createdAt: string;
  requestedById: string;
  assignedToId: string | null;
  project: { id: string; label: string } | null;
  enquiry: { id: string; label: string } | null;
  latestDrawing: { id: string; revision: string; fileUrl: string; approvalStatus: string } | null;
}

const TABS = [
  { key: "open", label: "Open" },
  { key: "", label: "All" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

function statusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return { variant: "ok" as const, label: "Completed" };
    case "DELIVERED":
      return { variant: "primary" as const, label: "Delivered — needs review" };
    case "CHANGES_REQUESTED":
      return { variant: "warn" as const, label: "Changes requested" };
    case "IN_PROGRESS":
      return { variant: "review" as const, label: "Being drawn" };
    case "CANCELLED":
      return { variant: "danger" as const, label: "Cancelled" };
    default:
      return { variant: "default" as const, label: "Waiting" };
  }
}

export function DrawingRequestsList({
  initialItems,
  initialCursor,
  status,
  view,
  canDraw,
  isAdmin,
  currentUserId,
  members,
}: {
  initialItems: DrawingRequestRow[];
  initialCursor: string | null;
  status: string;
  view: string;
  canDraw: boolean;
  isAdmin: boolean;
  currentUserId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  // Page 1 comes straight from props so router.refresh() after an action is reflected;
  // only the extra loaded pages live in state. (The v44 requests-list lesson — a
  // useState initializer runs once on mount and would strand a freshly-changed row.)
  const [more, setMore] = useState<{ items: DrawingRequestRow[]; cursor: string | null }>({
    items: [],
    cursor: null,
  });
  const items = [...initialItems, ...more.items];
  const cursor = more.items.length > 0 ? more.cursor : initialCursor;
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [reviewing, setReviewing] = useState<DrawingRequestRow | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ cursor, take: "50" });
      if (status) p.set("status", status);
      if (view) p.set("view", view);
      const res = await fetch(`/api/drawings?${p.toString()}`);
      if (!res.ok) throw new Error("Could not load more");
      const data: { items: DrawingRequestRow[]; nextCursor: string | null } = await res.json();
      setMore((prev) => ({ items: [...prev.items, ...data.items], cursor: data.nextCursor }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load more", "error");
    } finally {
      setLoading(false);
    }
  }

  function run(fn: () => Promise<unknown>, ok: string) {
    start(async () => {
      try {
        await fn();
        toast(ok);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "error");
      }
    });
  }

  const tabHref = (key: string) => (key ? `/drawings?status=${key}` : "/drawings");

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = (t.key === "" && !status && !view) || status === t.key;
          return (
            <Link
              key={t.key || "all"}
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
        <Link
          href="/drawings?view=overdue"
          className={
            "rounded-full px-3 py-1 text-xs font-medium " +
            (view === "overdue" ? "bg-danger text-white" : "border border-border bg-card text-muted")
          }
        >
          Overdue
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={DraftingCompass}
          title="No drawing requests here"
          description={
            canDraw
              ? "Raise one above, or switch tabs to see completed work."
              : "Requests you raise will appear here."
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const badge = statusBadge(r.status);
            const mine = r.requestedById === currentUserId;
            const canReview = r.status === "DELIVERED" && (mine || isAdmin);
            const canDeliver = canDraw && ["OPEN", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(r.status);
            return (
              <Card key={r.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {r.overdue && (
                        <Badge variant="danger">
                          <AlertTriangle className="size-3" /> Overdue
                        </Badge>
                      )}
                      {r.priority === "HIGH" && <Badge variant="warn">High priority</Badge>}
                      <span className="text-xs text-muted">{r.discipline}</span>
                    </div>

                    <div className="mt-0.5 font-medium">{r.title}</div>

                    <div className="text-xs text-muted">
                      {[
                        r.project ? `Project: ${r.project.label}` : null,
                        r.enquiry ? `Enquiry: ${r.enquiry.label}` : null,
                        r.dueDate ? `Needed by ${new Date(r.dueDate).toLocaleDateString("en-IN")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not linked to a project"}
                    </div>

                    {r.notes && <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg/80">{r.notes}</p>}
                    {r.changeReason && r.status === "CHANGES_REQUESTED" && (
                      <p className="mt-1.5 text-sm text-warn">Changes requested: {r.changeReason}</p>
                    )}

                    {r.latestDrawing && (
                      <a
                        href={r.latestDrawing.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <FileText className="size-4" /> Open drawing · Rev {r.latestDrawing.revision}
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] text-muted">
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </span>

                    {canDraw && members.length > 0 && r.status !== "COMPLETED" && r.status !== "CANCELLED" && (
                      <div className="flex items-center gap-1">
                        <UserPlus className="size-3.5 text-muted" />
                        <Select
                          className="h-8 w-40"
                          aria-label={`Assign ${r.title}`}
                          value={r.assignedToId ?? ""}
                          disabled={pending}
                          onChange={(e) =>
                            run(
                              () => assignDrawingRequestAction(r.id, e.target.value || null),
                              e.target.value ? "Assigned." : "Returned to the queue.",
                            )
                          }
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {canDeliver && (
                      <Uploader
                        // .dwg/.dxf have always been allowed by the API and are already
                        // served with the right Content-Type — only the old drawing
                        // widget's `accept` string was blocking them.
                        accept=".dwg,.dxf,application/pdf,image/*"
                        multiple={false}
                        compress={false}
                        label={r.status === "CHANGES_REQUESTED" ? "Upload revision" : "Upload drawing"}
                        onUploaded={(files) => {
                          const f = files[0];
                          if (!f) return;
                          run(
                            () => deliverDrawingAction(r.id, { fileUrl: f.url, changeNote: r.changeReason ?? undefined }),
                            "Drawing delivered.",
                          );
                        }}
                      />
                    )}

                    {canReview && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => reviewDeliveryAction(r.id, "ACCEPT"), "Accepted.")}
                        >
                          <Check className="size-3.5" /> Accept
                        </Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setReviewing(r)}>
                          <RotateCcw className="size-3.5" /> Request changes
                        </Button>
                      </div>
                    )}

                    {(mine || isAdmin) && ["OPEN", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(r.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => cancelDrawingRequestAction(r.id), "Request cancelled.")}
                      >
                        <X className="size-3.5" /> Cancel
                      </Button>
                    )}

                    {canDraw && r.status === "CANCELLED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => reopenDrawingRequestAction(r.id), "Reopened.")}
                      >
                        <RotateCcw className="size-3.5" /> Reopen
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

      <RequestChangesDialog
        request={reviewing}
        onClose={() => setReviewing(null)}
        onConfirm={(reason) => {
          const r = reviewing;
          setReviewing(null);
          if (r) run(() => reviewDeliveryAction(r.id, "REQUEST_CHANGES", reason), "Sent back for revision.");
        }}
      />
    </div>
  );
}

/** The reason is required — it's what the next revision is drawn from. */
function RequestChangesDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: DrawingRequestRow | null;
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
      title="Request changes"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {request?.title} · Rev {request?.latestDrawing?.revision}
        </p>
        <Field label="What needs changing?" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. blower is inside the plant room — move it outside and re-check the door swing"
            autoFocus
          />
        </Field>
        <p className="text-xs text-muted">
          The next upload becomes the next revision automatically, so this correction stays attached
          to the drawing that caused it.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Send back for revision
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
