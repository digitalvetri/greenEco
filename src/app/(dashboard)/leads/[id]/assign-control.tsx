"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { assignLeadAction } from "../actions";

interface Member {
  id: string;
  name: string;
}

/** Owner reassignment (admin-only — rendered only when session.role is ADMIN). */
export function AssignControl({
  leadId,
  members,
  currentOwnerId,
}: {
  leadId: string;
  members: Member[];
  currentOwnerId: string;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(currentOwnerId);
  const [pending, start] = useTransition();

  function onChange(userId: string) {
    const prev = owner;
    setOwner(userId);
    start(async () => {
      try {
        const res = await assignLeadAction(leadId, userId);
        toast(`Assigned to ${res.assignedToName}`);
        router.refresh();
      } catch (e) {
        setOwner(prev); // revert on failure
        toast(e instanceof Error ? e.message : "Could not reassign", "error");
      }
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      Owner
      <select
        value={owner}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Assign owner"
        className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
