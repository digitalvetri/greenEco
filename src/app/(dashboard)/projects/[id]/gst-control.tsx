"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Client state code" hint="2-digit GSTIN prefix (e.g. 33 = TN). Inter-state ⇒ IGST.">
        <Input className="h-9 w-28" value={state} onChange={(e) => setState(e.target.value)} placeholder="33" />
      </Field>
      <Field label="Client GSTIN">
        <Input className="h-9 w-52" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="33ABCDE1234F1Z5" />
      </Field>
      <Button size="sm" variant="outline" loading={pending} onClick={save}>Save GST</Button>
    </div>
  );
}
