"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { logProjectCallAction, sendProjectWhatsAppAction, sendProjectEmailAction } from "../actions";

type Mode = "call" | "whatsapp" | "email" | null;

/**
 * Log or send a client communication against a project. "Log call" records a
 * touch; the WhatsApp/email actions attempt a send via the wired provider and
 * record the result (LOGGED when no provider is configured). All show up in the
 * Activity timeline. Contact resolves order → proposal → lead.
 */
export function CommPanel({ orderId, hasEmail }: { orderId: string; hasEmail: boolean }) {
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
          await logProjectCallAction(orderId, body.trim() || "Call logged");
          toast("Call logged");
        } else if (mode === "whatsapp") {
          const r = await sendProjectWhatsAppAction(orderId, body);
          toast(r.sent ? "WhatsApp sent" : "Logged (WhatsApp not configured)");
        } else if (mode === "email") {
          const r = await sendProjectEmailAction(orderId, subject, body);
          toast(r.sent ? "Email sent" : "Logged (email not configured)");
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
      <Button variant="outline" size="sm" disabled={!hasEmail} onClick={() => setMode("email")} title={hasEmail ? undefined : "No email on this client"}>
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
