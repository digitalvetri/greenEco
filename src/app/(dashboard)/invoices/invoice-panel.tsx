"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileCheck, Printer } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/money";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { getInvoiceDetailAction, issueDraftInvoiceAction } from "./actions";
import type { InvoiceDetail } from "@/server/services/invoice";

/**
 * Slide-in invoice viewer — review + issue an invoice without leaving the current
 * screen (replaces the old open-in-a-new-tab print link). Fetches by id so it works
 * for auto-drafts that have no number yet.
 */
export function InvoicePanel({
  invoiceId,
  open,
  onClose,
  onChanged,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuing, startIssue] = useTransition();

  useEffect(() => {
    if (!open || !invoiceId) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    getInvoiceDetailAction(invoiceId)
      .then((d) => alive && setDetail(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, invoiceId]);

  function issue() {
    if (!invoiceId) return;
    startIssue(async () => {
      const r = await issueDraftInvoiceAction(invoiceId);
      if (!r.ok) return toast(r.error ?? "Failed to issue", "error");
      toast(`Issued ${r.invoiceNo}`);
      const d = await getInvoiceDetailAction(invoiceId);
      setDetail(d);
      onChanged?.();
      router.refresh();
    });
  }

  const isDraft = detail?.status === "DRAFT";
  const gstRows = detail
    ? [
        { label: `CGST${detail.gst.rate ? ` (${detail.gst.rate / 2}%)` : ""}`, value: detail.gst.cgst },
        { label: `SGST${detail.gst.rate ? ` (${detail.gst.rate / 2}%)` : ""}`, value: detail.gst.sgst },
        { label: `IGST${detail.gst.rate ? ` (${detail.gst.rate}%)` : ""}`, value: detail.gst.igst },
      ].filter((r) => Number(r.value) !== 0)
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{isDraft ? "Draft invoice" : detail?.invoiceNo ?? "Invoice"}</span>
          {isDraft && <Badge variant="warn">Draft</Badge>}
          {detail?.isCreditNote && <Badge variant="danger">Credit</Badge>}
        </span>
      }
      footer={
        detail && (
          <div className="flex items-center justify-end gap-2">
            {isDraft ? (
              <Button size="sm" onClick={issue} loading={issuing}>
                <FileCheck className="size-4" /> Issue invoice
              </Button>
            ) : (
              <>
                <a
                  href={`/print/invoice/${detail.invoiceNo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <Printer className="size-3.5" /> Print
                </a>
                <DownloadPdfButton docType="invoice" docId={detail.invoiceNo} />
              </>
            )}
          </div>
        )
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!loading && !detail && <p className="py-16 text-center text-sm text-muted">Invoice not found.</p>}
      {detail && (
        <div className="space-y-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-muted">Bill to</div>
              <div className="font-medium">{detail.clientName}</div>
              {detail.clientAddress && <div className="text-xs text-muted">{detail.clientAddress}</div>}
              {detail.clientGstin && <div className="text-xs text-muted">GSTIN: {detail.clientGstin}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Date</div>
              <div className="font-medium">{new Date(detail.date).toLocaleDateString("en-IN")}</div>
              {detail.orderNo && <div className="mt-1 text-xs text-muted">Project {detail.orderNo}</div>}
              <Badge className="mt-1">{detail.taxType}</Badge>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <Table className="text-xs">
              <THead>
                <TR className="border-t-0 text-muted">
                  <TH>Description</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {detail.lineItems.map((l, i) => (
                  <TR key={i}>
                    <TD>
                      {l.description}
                      {l.sac && <span className="ml-1 text-muted">· SAC {l.sac}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatINR(l.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="space-y-1">
            {gstRows.map((r) => (
              <div key={r.label} className="flex justify-between text-xs">
                <span className="text-muted">{r.label}</span>
                <span className="tabular-nums">{formatINR(r.value)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 text-sm font-semibold">
              <span>Total</span>
              <span className={"tabular-nums " + (detail.isCreditNote ? "text-danger" : "")}>
                {formatINR(detail.total)}
              </span>
            </div>
          </div>

          {detail.amountWords && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{detail.amountWords}</p>
          )}

          {isDraft && (
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
              This is an auto-draft. Issue it to assign a permanent invoice number — drafts are excluded from
              financial totals until issued.
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
