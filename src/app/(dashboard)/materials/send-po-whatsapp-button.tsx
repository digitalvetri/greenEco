"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { waShareLink } from "@/lib/share-links";
import { formatINR } from "@/lib/money";
import { sendPOWhatsAppAction } from "./actions";

/**
 * One-click "Send to vendor" — same instant pattern as leads/projects/service/
 * proposals (no compose dialog): opens the vendor's own WhatsApp immediately with
 * a ready-made message, and logs the send in the background (fire-and-forget,
 * never blocks or delays the redirect — a logging failure stays silent since the
 * user has already moved on to WhatsApp).
 */
export function SendPOWhatsAppButton({
  poId,
  poNo,
  vendorName,
  vendorPhone,
  totalValue,
  expectedDate,
}: {
  poId: string;
  poNo: string;
  vendorName: string;
  vendorPhone: string;
  totalValue: string;
  expectedDate: string;
}) {
  const router = useRouter();

  function send() {
    const body =
      `Hi ${vendorName}, please find our Purchase Order ${poNo} for ${formatINR(totalValue)}, ` +
      `expected delivery ${new Date(expectedDate).toLocaleDateString("en-IN")}. Please confirm receipt.`;
    window.open(waShareLink(vendorPhone, body), "_blank", "noopener,noreferrer");
    sendPOWhatsAppAction(poId, body)
      .then(() => router.refresh())
      .catch(() => {});
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!vendorPhone}
      title={vendorPhone ? undefined : "This vendor has no phone number on file"}
      onClick={send}
    >
      <MessageCircle className="size-3.5" /> WhatsApp
    </Button>
  );
}
