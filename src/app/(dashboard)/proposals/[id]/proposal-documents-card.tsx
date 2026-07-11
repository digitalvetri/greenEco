"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Uploader } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import { addProposalDocumentAction, deleteProposalDocumentAction } from "../actions";

interface Doc {
  id: string;
  url: string;
  name: string;
}

/** Documents on a proposal — signed copy, client PO, revised drawings, tender docs. */
export function ProposalDocumentsCard({ proposalId, documents }: { proposalId: string; documents: Doc[] }) {
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

  function remove(docId: string) {
    if (!confirm("Remove this document?")) return;
    start(async () => {
      try {
        await deleteProposalDocumentAction(proposalId, docId);
        toast("Document removed");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not remove", "error");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Documents</CardTitle>
        <Uploader accept="image/*,application/pdf,.dwg,.dxf" onUploaded={onUploaded} label="Add" />
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {documents.length === 0 && (
          <span className="text-muted">No documents. Attach the signed proposal, client PO, or revised drawings.</span>
        )}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2">
            <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{d.name}</span>
            </a>
            <button onClick={() => remove(d.id)} disabled={pending} aria-label={`Remove ${d.name}`} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
