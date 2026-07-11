"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertLeadAction } from "../actions";

export function ConvertButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function convert() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await convertLeadAction(leadId);
        router.push(`/proposals/${res.proposalId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Conversion failed");
      }
    });
  }

  return (
    <div>
      <Button onClick={convert} disabled={pending} variant="subtle">
        <FileUp className="size-4" /> {pending ? "Converting…" : "Convert to Proposal"}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
