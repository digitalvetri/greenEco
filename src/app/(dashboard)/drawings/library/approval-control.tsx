"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { setDrawingApprovalAction } from "../actions";

const LABEL: Record<string, string> = {
  DRAFT: "Draft",
  FOR_APPROVAL: "For approval",
  APPROVED: "Approved",
  SUPERSEDED: "Superseded",
};

function variant(status: string) {
  if (status === "APPROVED") return "ok" as const;
  if (status === "FOR_APPROVAL") return "warn" as const;
  if (status === "SUPERSEDED") return "default" as const;
  return "default" as const;
}

/**
 * The approval control for a drawing.
 *
 * `setDrawingApproval` has existed since Phase 2 — admin-guarded, audited — with zero
 * call sites, so FOR_APPROVAL and APPROVED were unreachable and every drawing displayed
 * "DRAFT" for its whole life. This is the UI that was missing.
 *
 * SUPERSEDED is deliberately not offered: it isn't a decision anyone makes, it's what
 * the revision engine sets when a newer revision replaces this one. A superseded
 * drawing shows its status read-only.
 */
export function ApprovalControl({
  drawingId,
  status,
  isAdmin,
  superseded,
}: {
  drawingId: string;
  status: string;
  isAdmin: boolean;
  superseded: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!isAdmin || superseded) {
    return <Badge variant={variant(status)}>{LABEL[status] ?? status}</Badge>;
  }

  return (
    <Select
      className="h-9 w-40"
      aria-label="Approval status"
      value={status === "SUPERSEDED" ? "DRAFT" : status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as "DRAFT" | "FOR_APPROVAL" | "APPROVED";
        start(async () => {
          try {
            await setDrawingApprovalAction(drawingId, next);
            toast(`Marked ${LABEL[next].toLowerCase()}.`);
            router.refresh();
          } catch (err) {
            toast(err instanceof Error ? err.message : "Could not update", "error");
          }
        });
      }}
    >
      <option value="DRAFT">Draft</option>
      <option value="FOR_APPROVAL">For approval</option>
      <option value="APPROVED">Approved</option>
    </Select>
  );
}
