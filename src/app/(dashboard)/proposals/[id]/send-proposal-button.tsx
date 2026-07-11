"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendProposalAction } from "../actions";

/**
 * Send the proposal to the client (WhatsApp/email) and log it to the timeline.
 * Delivery is gated (no provider → "logged, not sent"); the touch is always recorded.
 */
export function SendProposalButtons({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function send(channel: "WHATSAPP" | "EMAIL") {
    start(async () => {
      try {
        const r = await sendProposalAction(proposalId, channel);
        toast(r.sent ? `Sent via ${channel === "WHATSAPP" ? "WhatsApp" : "email"}` : "Logged (not configured)");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Send failed", "error");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => send("WHATSAPP")}>
        <MessageCircle className="size-4" /> Send WhatsApp
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => send("EMAIL")}>
        <Mail className="size-4" /> Send email
      </Button>
    </>
  );
}
