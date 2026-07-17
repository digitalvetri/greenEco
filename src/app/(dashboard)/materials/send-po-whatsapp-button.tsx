"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { poShareDraftAction, sendPOWhatsAppAction } from "./actions";

/**
 * "Share via WhatsApp" for a PO — auto-populates the vendor's phone + a default
 * message, but always stops for a review/edit step before actually sending
 * (spec: "allow users to review the message before sending"), unlike the
 * proposal/project send buttons which fire immediately.
 */
export function SendPOWhatsAppButton({ poId, poNo }: { poId: string; poNo: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    try {
      const draft = await poShareDraftAction(poId);
      setVendorName(draft.vendorName);
      setVendorPhone(draft.vendorPhone);
      setBody(draft.defaultMessage);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load vendor details", "error");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function send() {
    start(async () => {
      try {
        const r = await sendPOWhatsAppAction(poId, body);
        toast(r.sent ? "Sent via WhatsApp" : "Logged (not configured — no provider set)");
        setOpen(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Send failed", "error");
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <MessageCircle className="size-3.5" /> Share
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Send ${poNo} to vendor`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Loading vendor details…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="font-medium">{vendorName}</span>
              <span className="text-muted"> · {vendorPhone || "no phone on file"}</span>
            </div>
            <Field label="Message" hint="Edit before sending — this is exactly what the vendor receives.">
              <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !vendorPhone || !body.trim()} loading={pending} onClick={send}>
                <MessageCircle className="size-4" /> Send WhatsApp
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
