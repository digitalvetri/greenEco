"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { deleteUserAction } from "./actions";

/** Admin-only, permanent — confirmed via a dialog since this can't be undone. */
export function DeleteUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirmDelete() {
    start(async () => {
      const res = await deleteUserAction(userId);
      if (res.ok) {
        toast(`${name} deleted.`);
        setOpen(false);
        router.refresh();
      } else {
        toast(res.error ?? "Delete failed", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${name}`}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
      >
        <Trash2 className="size-3" /> Delete
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}?`}>
        <div className="space-y-3">
          <p className="text-sm text-muted">
            This permanently removes {name}&apos;s account and login access. This can&apos;t be undone — their
            past activity (leads, follow-ups, audit history) stays on record, just no longer linked to a live
            account. To keep their history but block sign-in instead, use <strong>Edit → Status → Deactivated</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={pending} onClick={confirmDelete}>
              <Trash2 className="size-4" /> Delete permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
