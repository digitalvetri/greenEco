"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setOrderStatusAction } from "../actions";

/** Project lifecycle control (admin) — makes ON_HOLD/COMPLETED/CANCELLED reachable + reopen. */
export function OrderStatusControl({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(next: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED", label: string) {
    if (next === "CANCELLED" && !confirm("Cancel this project?")) return;
    start(async () => {
      try {
        await setOrderStatusAction(orderId, next);
        toast(label);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update", "error");
      }
    });
  }

  const active = status === "ACTIVE";
  return (
    <div className="flex flex-wrap gap-2">
      {active && (
        <>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => set("ON_HOLD", "Project on hold")}>
            <PauseCircle className="size-4" /> Hold
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => set("COMPLETED", "Project completed")}>
            <CheckCircle2 className="size-4" /> Complete
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} className="text-danger" onClick={() => set("CANCELLED", "Project cancelled")}>
            <XCircle className="size-4" /> Cancel
          </Button>
        </>
      )}
      {!active && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => set("ACTIVE", "Project reopened")}>
          <RotateCcw className="size-4" /> Reopen
        </Button>
      )}
    </div>
  );
}
