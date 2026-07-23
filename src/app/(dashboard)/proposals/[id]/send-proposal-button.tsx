"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { waShareLink, mailtoLink } from "@/lib/share-links";
import { sendProposalAction } from "../actions";

/**
 * Send the proposal to the client (WhatsApp/email) and log it to the timeline.
 * Delivery is gated (no provider configured, or the send fails) — when that
 * happens, falls back to opening the user's own WhatsApp/mail app with the
 * proposal link pre-filled, so the client still gets it.
 */
export function SendProposalButtons({ proposalId, proposalNumber }: { proposalId: string; proposalNumber: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function send(channel: "WHATSAPP" | "EMAIL") {
    start(async () => {
      try {
        const r = await sendProposalAction(proposalId, channel);
        if (r.sent) {
          toast(`Sent via ${channel === "WHATSAPP" ? "WhatsApp" : "email"}`);
        } else if (channel === "WHATSAPP" && r.to) {
          window.open(waShareLink(r.to, r.body), "_blank", "noopener,noreferrer");
          toast("Logged — opening WhatsApp to send");
        } else if (channel === "EMAIL" && r.to) {
          window.location.href = mailtoLink(r.to, `Proposal ${proposalNumber} — Green Ecocare`, r.body);
          toast("Logged — opening your email app");
        }
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
