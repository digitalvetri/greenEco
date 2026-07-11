"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { setOrderGstAction } from "../actions";

/**
 * Admin control for the customer's GST place-of-supply (state code) + GSTIN. Drives
 * whether invoices raised for this project are IGST (inter-state) or CGST/SGST, and
 * prints the customer GSTIN on the tax invoice.
 */
export function GstControl({ orderId, clientStateCode, clientGstin }: { orderId: string; clientStateCode: string | null; clientGstin: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(clientStateCode ?? "");
  const [gstin, setGstin] = useState(clientGstin ?? "");

  // Neither set on the saved order → invoices silently default to intra-state.
  const unset = !clientStateCode && !clientGstin;

  // A GSTIN's first two digits are the state code — offer to derive it as the user types.
  function onGstin(v: string) {
    const up = v.toUpperCase();
    setGstin(up);
    if (!state.trim() && /^\d{2}/.test(up)) setState(up.slice(0, 2));
  }

  function save() {
    start(async () => {
      try {
        await setOrderGstAction(orderId, { clientStateCode: state, clientGstin: gstin });
        toast("Customer GST saved");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to save", "error");
      }
    });
  }

  return (
    <div className="space-y-3">
      {unset && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Client state code not set — invoices will default to <strong>intra-state (CGST/SGST)</strong>. Set the
            client&apos;s state code (or GSTIN) so inter-state supply is billed as <strong>IGST</strong>.
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Client state code" hint="2-digit GSTIN prefix (e.g. 33 = TN). Inter-state ⇒ IGST.">
          <Input className="h-9 w-28" value={state} onChange={(e) => setState(e.target.value)} placeholder="33" />
        </Field>
        <Field label="Client GSTIN">
          <Input className="h-9 w-52" value={gstin} onChange={(e) => onGstin(e.target.value)} placeholder="33ABCDE1234F1Z5" />
        </Field>
        <Button size="sm" variant="outline" loading={pending} onClick={save}>Save GST</Button>
      </div>
    </div>
  );
}
