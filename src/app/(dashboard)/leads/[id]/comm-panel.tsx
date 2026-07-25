"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { waShareLink, mailtoLink } from "@/lib/share-links";
import { logCallAction, sendWhatsAppAction, sendEmailAction } from "../actions";

const EMAIL_SUBJECT = "Regarding your enquiry — Green Ecocare";

/**
 * Log or send a communication against a lead. WhatsApp/Email are one-click quick
 * actions (no compose dialog) — they open WhatsApp/the email app immediately with
 * a ready-made message, the same instant a phone quick-dial icon would, and log
 * the touch in the background (fire-and-forget, never blocks or delays the
 * redirect). "Log call" is the one action that still needs typed notes, so it
 * keeps its dialog.
 */
export function CommPanel({
  leadId,
  phone,
  email,
  customerName,
}: {
  leadId: string;
  phone: string;
  email: string | null;
  customerName: string;
}) {
  const router = useRouter();
  const [callOpen, setCallOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  function logCall() {
    start(async () => {
      try {
        await logCallAction(leadId, notes.trim() || "Call logged");
        toast("Call logged");
        setCallOpen(false);
        setNotes("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }

  function quickWhatsApp() {
    const body = `Hi ${customerName}, this is Green Ecocare following up on your enquiry.`;
    window.open(waShareLink(phone, body), "_blank", "noopener,noreferrer");
    sendWhatsAppAction(leadId, body)
      .then(() => router.refresh())
      .catch(() => {}); // redirect already happened; a logging failure here is silent
  }

  function quickEmail() {
    if (!email) return;
    const body = `Hi ${customerName},\n\nThis is Green Ecocare following up on your enquiry.\n\nRegards,\nGreen Ecocare`;
    window.location.href = mailtoLink(email, EMAIL_SUBJECT, body);
    sendEmailAction(leadId, EMAIL_SUBJECT, body)
      .then(() => router.refresh())
      .catch(() => {});
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setCallOpen(true)}>
        <Phone className="size-4" /> Log call
      </Button>
      <Button variant="outline" size="sm" onClick={quickWhatsApp}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" disabled={!email} onClick={quickEmail} title={email ? undefined : "No email on this lead"}>
        <Mail className="size-4" /> Email
      </Button>

      <Dialog open={callOpen} onClose={() => setCallOpen(false)} title="Log a call">
        <div className="space-y-3">
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCallOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={logCall}>
              Log call
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
