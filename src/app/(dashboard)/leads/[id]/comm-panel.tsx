"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { waShareLink, mailtoLink } from "@/lib/share-links";
import { logCallAction, sendWhatsAppAction, sendEmailAction } from "../actions";

type Mode = "call" | "whatsapp" | "email" | null;

/**
 * Log or send a communication against a lead. "Log call" records a touch. WhatsApp/
 * email attempt a send via the wired provider (and always log the touch); when no
 * provider is configured (or the send fails), it falls back to redirecting the user
 * to their own WhatsApp/mail app with the client's number/address and message
 * pre-filled, so the message still goes out — just from the user's own account.
 */
export function CommPanel({ leadId, phone, email }: { leadId: string; phone: string; email: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [pending, start] = useTransition();

  function close() {
    setMode(null);
    setBody("");
    setSubject("");
  }

  function submit() {
    start(async () => {
      try {
        if (mode === "call") {
          await logCallAction(leadId, body.trim() || "Call logged");
          toast("Call logged");
        } else if (mode === "whatsapp") {
          const r = await sendWhatsAppAction(leadId, body);
          if (r.sent) {
            toast("WhatsApp sent");
          } else {
            window.open(waShareLink(phone, body), "_blank", "noopener,noreferrer");
            toast("Logged — opening WhatsApp to send");
          }
        } else if (mode === "email") {
          const r = await sendEmailAction(leadId, subject, body);
          if (r.sent) {
            toast("Email sent");
          } else if (email) {
            window.location.href = mailtoLink(email, subject, body);
            toast("Logged — opening your email app");
          }
        }
        close();
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }

  const title = mode === "call" ? "Log a call" : mode === "whatsapp" ? "WhatsApp message" : "Email";

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setMode("call")}>
        <Phone className="size-4" /> Log call
      </Button>
      <Button variant="outline" size="sm" onClick={() => setMode("whatsapp")}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" disabled={!email} onClick={() => setMode("email")} title={email ? undefined : "No email on this lead"}>
        <Mail className="size-4" /> Email
      </Button>

      <Dialog open={mode !== null} onClose={close} title={title}>
        <div className="space-y-3">
          {mode === "email" && (
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            </Field>
          )}
          <Field label={mode === "call" ? "Notes" : "Message"}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={mode === "call" ? "What was discussed…" : "Type your message…"}
            />
          </Field>
          {mode === "whatsapp" && <p className="text-xs text-muted">Opens WhatsApp to {phone} with this message pre-filled.</p>}
          {mode === "email" && email && <p className="text-xs text-muted">Opens your email app addressed to {email}.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || (mode !== "call" && !body.trim()) || (mode === "email" && !subject.trim())}
              onClick={submit}
            >
              {mode === "call" ? "Log call" : "Send"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
