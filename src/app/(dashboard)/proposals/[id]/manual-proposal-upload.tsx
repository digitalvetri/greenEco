"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Uploader } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import { addProposalDocumentAction } from "../actions";

interface Doc {
  id: string;
  url: string;
  name: string;
}

/** Storage for a proposal prepared outside the app (Word/PDF drafted by staff) — writes
 *  through the same ProposalDocument model as the Documents tab, just surfaced prominently
 *  on the main tab so it isn't missed. The Documents tab remains the full list/delete UI. */
export function ManualProposalUpload({ proposalId, documents }: { proposalId: string; documents: Doc[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onUploaded(files: { url: string; name: string }[]) {
    start(async () => {
      try {
        for (const f of files) await addProposalDocumentAction(proposalId, f);
        toast(`Added ${files.length} document${files.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Upload failed", "error");
      }
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Manually prepared proposal</CardTitle>
        <Uploader accept="application/pdf,.doc,.docx" onUploaded={onUploaded} label={pending ? "Uploading…" : "Upload"} />
      </CardHeader>
      <CardContent className="text-sm text-muted">
        {documents.length === 0 ? (
          <span>If a proposal was drafted outside the app, attach it here instead of using the AI generator below.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {documents.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
              >
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{d.name}</span>
              </a>
            ))}
            <span className="text-xs">— manage or remove in the Documents tab.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
