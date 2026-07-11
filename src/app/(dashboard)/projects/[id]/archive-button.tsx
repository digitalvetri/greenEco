"use client";

import { useState, useTransition } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { archiveOrderAction } from "../actions";

/** Admin-only soft-delete. Confirms, then archives and returns to the list. */
export function ArchiveButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      try {
        await archiveOrderAction(orderId);
        // redirect() throws NEXT_REDIRECT; navigation follows.
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        toast(e instanceof Error ? e.message : "Failed to archive", "error");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Archive className="size-4" /> Archive
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Archive this project?">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            It will be hidden from all project lists, stats, and analytics. Execution data (stages,
            payments, drawings) is preserved and can be restored from the database.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={confirm}>
              Archive project
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
