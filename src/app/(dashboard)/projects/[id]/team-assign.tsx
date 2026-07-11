"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { assignTeamAction, removeTeamAction } from "../actions";

const ROLES = ["PROJECT_MANAGER", "CIVIL_ENGINEER", "SUPERVISOR"];

/** Admin control to un-assign a team member from a project. */
export function TeamRemove({ orderId, userId, name }: { orderId: string; userId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function remove() {
    start(async () => {
      try {
        await removeTeamAction(orderId, userId);
        toast("Team member removed");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to remove", "error");
      }
    });
  }
  return (
    <button
      onClick={remove}
      disabled={pending}
      aria-label={`Remove ${name}`}
      title={`Remove ${name}`}
      className="text-muted hover:text-danger disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

export function TeamAssign({ orderId, users }: { orderId: string; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState(ROLES[0]);

  function assign() {
    if (!userId) return;
    start(async () => {
      try {
        await assignTeamAction(orderId, userId, role);
        toast("Team member assigned");
        setUserId("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to assign", "error");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Select className="h-9 flex-1" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="User">
        <option value="">Add team member…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Select className="h-9 w-40" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, " ")}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={assign} loading={pending} disabled={!userId}>
        <UserPlus className="size-4" /> Assign
      </Button>
    </div>
  );
}
