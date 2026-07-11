"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Uploader } from "@/components/mobile/uploader";
import { toast } from "@/components/ui/toast";
import { addOrderDocumentAction, deleteOrderDocumentAction } from "../actions";

interface Doc {
  id: string;
  fileUrl: string;
  title: string;
}

/** Project documents — contracts, permits, site reports, handover docs (not drawings). */
export function ProjectDocumentsCard({ orderId, documents }: { orderId: string; documents: Doc[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onUploaded(files: { url: string; name: string }[]) {
    start(async () => {
      try {
        for (const f of files) await addOrderDocumentAction(orderId, f);
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
        await deleteOrderDocumentAction(orderId, docId);
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
          <span className="text-muted">No documents. Attach contracts, permits, site reports, or handover docs.</span>
        )}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2">
            <a href={d.fileUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{d.title}</span>
            </a>
            <button onClick={() => remove(d.id)} disabled={pending} aria-label={`Remove ${d.title}`} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
