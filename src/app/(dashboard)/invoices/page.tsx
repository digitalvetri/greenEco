import { getSession } from "@/lib/auth";
import { Receipt, IndianRupee, AlarmClock, RotateCcw } from "lucide-react";
import { listInvoices, invoiceStats } from "@/server/services/invoice";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { Card } from "@/components/ui/card";
import { InvoiceList, type InvoiceRow } from "./invoice-list";
import { InvoicesSearch } from "./invoices-search";
import { NewInvoiceDialog } from "./new-invoice-dialog";

export const dynamic = "force-dynamic";

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const session = await getSession();
  if (session.role !== "ADMIN") {
    return (
      <div>
        <PageHeader title="Invoices" />
        <Card className="p-8 text-center text-sm text-muted">Invoices are available to admins only.</Card>
      </div>
    );
  }

  const [{ items, nextCursor }, stats] = await Promise.all([
    listInvoices(session, { search: search || undefined, take: 50 }),
    invoiceStats(session),
  ]);

  const rows: InvoiceRow[] = items.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    taxType: inv.taxType,
    total: inv.total.toString(),
    date: inv.date.toISOString(),
    isCreditNote: inv.isCreditNote,
    status: inv.status,
  }));

  const query = new URLSearchParams(search ? { search } : {}).toString();

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${items.length}${nextCursor ? "+" : ""} shown`}
        action={<NewInvoiceDialog onCreated={() => {}} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Invoices" value={stats.count} icon={Receipt} tone="primary" />
        <StatTile label="Invoiced (net)" value={stats.invoicedTotal > 0 ? compactINR(stats.invoicedTotal) : "—"} icon={IndianRupee} tone="ok" />
        <StatTile label="Invoiced outstanding" value={stats.outstanding > 0 ? compactINR(stats.outstanding) : "—"} hint="on invoiced milestones" icon={AlarmClock} tone={stats.outstanding > 0 ? "warn" : "default"} />
        <StatTile label="Credit notes" value={stats.creditNotes} icon={RotateCcw} tone={stats.creditNotes > 0 ? "danger" : "default"} />
      </div>

      <InvoicesSearch />
      <InvoiceList key={query} initialItems={rows} initialCursor={nextCursor} query={query} />
    </div>
  );
}
