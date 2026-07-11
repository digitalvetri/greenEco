import { getSession } from "@/lib/auth";
import { getReceivables, getReferenceAnalytics, getGstSummary, getCollectionSummary } from "@/server/services/reports";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          <div className="flex items-center gap-2">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1">Rate</th>
                  <th className="pb-1 text-right">Invoices</th>
                  <th className="pb-1 text-right">Taxable</th>
                  <th className="pb-1 text-right">CGST</th>
                  <th className="pb-1 text-right">SGST</th>
                  <th className="pb-1 text-right">IGST</th>
                  <th className="pb-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {gst.groups.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted">No invoices yet.</td></tr>
                )}
                {gst.groups.map((g) => (
                  <tr key={g.rate} className="border-t border-border">
                    <td className="py-1.5">{g.rate}%</td>
                    <td className="py-1.5 text-right tabular-nums">{g.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(g.taxable)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(g.cgst)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(g.sgst)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(g.igst)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatINR(g.total)}</td>
                  </tr>
                ))}
                {gst.groups.length > 0 && (
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">{gst.invoiceCount}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(gst.grand.taxable)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(gst.grand.cgst)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(gst.grand.sgst)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(gst.grand.igst)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatINR(gst.grand.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Receivables — projects × milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1">Project</th>
                  <th className="pb-1">Milestone</th>
                  <th className="pb-1 text-right">Balance</th>
                  <th className="pb-1">Due</th>
                  <th className="pb-1 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {receivables.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted">
                      Nothing outstanding.
                    </td>
                  </tr>
                )}
                {receivables.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5">
                      <div className="font-mono text-xs">{r.orderNo}</div>
                      <div className="text-xs text-muted">{r.client}</div>
                    </td>
                    <td className="py-1.5">{r.description}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatINR(r.balance)}</td>
                    <td className="py-1.5 text-xs text-muted">
                      {r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "-"}
                    </td>
                    <td className="py-1.5 text-right">
                      {r.daysOverdue > 0 ? <Badge variant="danger">{r.daysOverdue}d</Badge> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
