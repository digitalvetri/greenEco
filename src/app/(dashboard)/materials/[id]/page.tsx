import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { itemLedger } from "@/server/services/materials";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, "ok" | "danger" | "warn" | "primary" | "default"> = {
  GRN: "ok",
  TRANSFER_IN: "primary",
  TRANSFER_OUT: "warn",
  CONSUME: "danger",
  ADJUST: "default",
  RETURN: "ok",
};

export default async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const data = await itemLedger(session, id);
  if (!data) notFound();
  const isAdmin = session.role === "ADMIN";
  const { item, total, lowStock, byLocation, ledger } = data;
  const vendorPrices = "vendorPrices" in data ? (data as { vendorPrices: { vendor: string; rate: string; date: Date }[] }).vendorPrices : [];

  return (
    <div>
      <PageHeader
        title={item.name}
        subtitle={`${item.category}${item.specification ? ` · ${item.specification}` : ""}`}
        action={
          <Link href="/materials" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted">
            <ArrowLeft className="size-4" /> Back to materials
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="On hand" value={`${total} ${item.unit}`} badge={lowStock ? "low" : undefined} />
        <Mini label="Reorder level" value={`${item.reorderLevel} ${item.unit}`} />
        <Mini label="Locations" value={String(byLocation.length)} />
        {isAdmin && (
          <Mini label="Purchase price" value={"purchasePrice" in item && item.purchasePrice ? formatINR(String(item.purchasePrice)) : "—"} />
        )}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>On hand by location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {byLocation.length === 0 ? (
              <p className="text-muted">No stock anywhere yet.</p>
            ) : (
              byLocation.map((b) => (
                <div key={b.location} className="flex justify-between">
                  <span className="text-muted">{b.location}</span>
                  <span className="font-medium tabular-nums">{b.qty} {item.unit}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Vendor prices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {vendorPrices.length === 0 ? (
                <p className="text-muted">No purchase history yet.</p>
              ) : (
                vendorPrices.map((v, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted">{v.vendor} · {new Date(v.date).toLocaleDateString("en-IN")}</span>
                    <span className="font-medium tabular-nums">{formatINR(v.rate)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock movement ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted">No movements yet.</p>
          ) : (
            <Table>
              <THead>
                <TR className="border-t-0">
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Qty</TH>
                  <TH>Movement</TH>
                  {isAdmin && <TH className="text-right">Value ₹</TH>}
                  <TH className="text-right">Balance</TH>
                </TR>
              </THead>
              <TBody>
                {ledger.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs text-muted">{new Date(r.at).toLocaleString("en-IN")}</TD>
                    <TD>
                      <Badge variant={TYPE_TONE[r.type] ?? "default"}>{r.type.replace(/_/g, " ")}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{r.qty}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted">
                      {r.fromLocation && r.toLocation
                        ? `${r.fromLocation} → ${r.toLocation}`
                        : r.toLocation
                          ? `→ ${r.toLocation}`
                          : r.fromLocation
                            ? `${r.fromLocation} →`
                            : "—"}
                      {r.note ? ` · ${r.note}` : ""}
                    </TD>
                    {isAdmin && (
                      <TD className="text-right tabular-nums">
                        {"valueAtCost" in r && r.valueAtCost ? formatINR(String(r.valueAtCost)) : "—"}
                      </TD>
                    )}
                    <TD className="text-right font-medium tabular-nums">{r.runningTotal}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
        {value}
        {badge && <Badge variant="danger">{badge}</Badge>}
      </div>
    </div>
  );
}
