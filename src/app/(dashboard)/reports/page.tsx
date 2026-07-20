import { getSession } from "@/lib/auth";
import { getReceivables, getReferenceAnalytics, getGstSummary, getCollectionSummary } from "@/server/services/reports";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat";
import { ExportButton } from "@/components/ui/export-button";
import { formatINR } from "@/lib/money";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") {
    return (
      <div>
        <PageHeader title="Reports" />
        <Card className="p-8 text-center text-sm text-muted">Reports are available to admins only.</Card>
      </div>
    );
  }

  const [receivables, refs, gst, collection] = await Promise.all([
    getReceivables(session),
    getReferenceAnalytics(session),
    getGstSummary(session),
    getCollectionSummary(session),
  ]);

  return (
    <div>
      <PageHeader
        title="Reports"
        action={
          <ExportButton
            rows={receivables.rows as unknown as Record<string, unknown>[]}
            filename="receivables"
            label="Export Receivables"
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Invoiced (net)" value={formatINR(collection.invoicedNet)} tone="ok" />
        <StatTile label="Collected" value={formatINR(collection.collected)} tone="primary" />
        <StatTile label="Outstanding" value={formatINR(receivables.totalOutstanding)} tone={Number(receivables.totalOutstanding) > 0 ? "warn" : "default"} />
        <StatTile label="Overdue" value={formatINR(receivables.totalOverdue)} tone={Number(receivables.totalOverdue) > 0 ? "danger" : "default"} />
      </div>

      <Card className="mb-5">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>GST summary (for GSTR filing)</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/exports/tally"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground"
              title="Export all GST invoices as Tally vouchers (XML)"
            >
              <FileDown className="size-4" /> Export Tally
            </a>
            <ExportButton
              rows={gst.groups as unknown as Record<string, unknown>[]}
              filename="gst-summary"
              label="Export GST"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR className="border-t-0">
                <TH>Rate</TH>
                <TH className="text-right">Invoices</TH>
                <TH className="text-right">Taxable</TH>
                <TH className="text-right">CGST</TH>
                <TH className="text-right">SGST</TH>
                <TH className="text-right">IGST</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {gst.groups.length === 0 && (
                <TR><TD colSpan={7} className="py-4 text-center text-muted">No invoices yet.</TD></TR>
              )}
              {gst.groups.map((g) => (
                <TR key={g.rate}>
                  <TD>{g.rate}%</TD>
                  <TD className="text-right tabular-nums">{g.count}</TD>
                  <TD className="text-right tabular-nums">{formatINR(g.taxable)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(g.cgst)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(g.sgst)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(g.igst)}</TD>
                  <TD className="text-right font-medium tabular-nums">{formatINR(g.total)}</TD>
                </TR>
              ))}
              {gst.groups.length > 0 && (
                <TR className="border-t-2 font-semibold">
                  <TD>Total</TD>
                  <TD className="text-right tabular-nums">{gst.invoiceCount}</TD>
                  <TD className="text-right tabular-nums">{formatINR(gst.grand.taxable)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(gst.grand.cgst)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(gst.grand.sgst)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(gst.grand.igst)}</TD>
                  <TD className="text-right tabular-nums">{formatINR(gst.grand.total)}</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Receivables — projects × milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR className="border-t-0">
                <TH>Project</TH>
                <TH>Milestone</TH>
                <TH className="text-right">Balance</TH>
                <TH>Due</TH>
                <TH className="text-right">Overdue</TH>
              </TR>
            </THead>
            <TBody>
              {receivables.rows.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-4 text-center text-muted">
                    Nothing outstanding.
                  </TD>
                </TR>
              )}
              {receivables.rows.map((r, i) => (
                <TR key={i}>
                  <TD>
                    <div className="font-mono text-xs">{r.orderNo}</div>
                    <div className="text-xs text-muted">{r.client}</div>
                  </TD>
                  <TD>{r.description}</TD>
                  <TD className="text-right font-medium tabular-nums">{formatINR(r.balance)}</TD>
                  <TD className="text-xs text-muted whitespace-nowrap">
                    {r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "-"}
                  </TD>
                  <TD className="text-right">
                    {r.daysOverdue > 0 ? <Badge variant="danger">{r.daysOverdue}d</Badge> : "-"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference Analytics — who drives business</CardTitle>
        </CardHeader>
        <CardContent>
          {refs.length === 0 && <p className="text-sm text-muted">No reference data yet.</p>}
          {refs.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
              <span className="font-medium">{r.name}</span>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{r.leads} leads</span>
                <span className="text-ok">{r.won} won</span>
                <span className="font-medium text-foreground">{formatINR(r.value)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
