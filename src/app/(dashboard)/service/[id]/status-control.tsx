"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setContractStatusAction, renewContractAction } from "../actions";

/**
 * Admin lifecycle control for an AMC — cancel / reactivate, plus Renew (offered
 * when the contract is expiring or lapsed). EXPIRED is cron-owned; Renew mints the
 * next term and links the chain (feeding the renewal-rate metric).
 */
export function ContractStatusControl({
  contractId,
  status,
  canRenew,
}: {
  contractId: string;
  status: string;
  canRenew: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(next: "ACTIVE" | "CANCELLED") {
    start(async () => {
      try {
        await setContractStatusAction(contractId, next);
        toast(next === "CANCELLED" ? "Contract cancelled" : "Contract reactivated");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update status", "error");
      }
    });
  }

  function renew() {
    start(async () => {
      try {
        const res = await renewContractAction(contractId);
        toast(`Renewed → ${res.contractNo} (${res.visits} visits)`);
        router.push(`/service/${res.contractId}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not renew", "error");
      }
    });
  }

  return (
    <>
      {canRenew && (
        <Button variant="outline" size="sm" loading={pending} onClick={renew}>
          <RefreshCw className="size-4" /> Renew
        </Button>
      )}
      {status === "CANCELLED" ? (
        <Button variant="outline" size="sm" loading={pending} onClick={() => set("ACTIVE")}>
          <RotateCcw className="size-4" /> Reactivate
        </Button>
      ) : (
        <Button variant="outline" size="sm" loading={pending} onClick={() => set("CANCELLED")}>
          <Ban className="size-4" /> Cancel contract
        </Button>
      )}
    </>
  );
}
