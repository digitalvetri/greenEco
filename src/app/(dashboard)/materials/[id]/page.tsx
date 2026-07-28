import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { itemLedger } from "@/server/services/materials";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { EditItemCard } from "./edit-item-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  const item = await prisma.item.findFirst({ where: { id, companyId: session.companyId }, select: { name: true } });
  return { title: item ? `${item.name} — Green Ecocare CRM` : "Item — Green Ecocare CRM" };
}

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
  const priceBreakdown =
    "priceBreakdown" in data
      ? (
          data as {
            priceBreakdown: {
              base: string;
              gstRate: number;
              gst: string;
              totalWithGst: string;
              catalogFreight: string | null;
              catalogLoadingCharges: string | null;
            } | null;
          }
        ).priceBreakdown
      : null;
  const poHistory =
    "poHistory" in data
      ? (data as {
          poHistory: { poNo: string; vendor: string; date: Date; qty: number; rate: number; freight: string | null; loadingCharges: string | null }[];
        }).poHistory
      : [];

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

      {isAdmin && (
        <div className="mb-4 space-y-2">
          <EditItemCard
            itemId={item.id}
            isAdmin={isAdmin}
            item={{
              category: item.category,
              unit: item.unit,
              specification: item.specification,
              reorderLevel: item.reorderLevel,
              purchasePrice: "purchasePrice" in item ? item.purchasePrice : null,
              catalogFreight: "catalogFreight" in item ? item.catalogFreight : null,
              catalogLoadingCharges: "catalogLoadingCharges" in item ? item.catalogLoadingCharges : null,
            }}
          />
          <p className="text-xs text-muted">
            Editing here changes the item&apos;s master details (category/unit/spec/reorder level/price). To
            record actual on-hand quantity, use{" "}
            <Link href="/materials/operations" className="text-primary underline underline-offset-2">
              Materials → Operations → Stock Audit
            </Link>{" "}
            instead — it logs the count as a proper stock movement rather than overwriting a number silently.
          </p>
        </div>
      )}

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

        {isAdmin && priceBreakdown && (
          <Card>
            <CardHeader>
              <CardTitle>Price breakdown (reference)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Base price</span>
                <span className="font-medium tabular-nums">{formatINR(priceBreakdown.base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">GST @ {priceBreakdown.gstRate}%</span>
                <span className="font-medium tabular-nums">{formatINR(priceBreakdown.gst)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-medium">Total with GST</span>
                <span className="font-semibold tabular-nums">{formatINR(priceBreakdown.totalWithGst)}</span>
              </div>
              {(priceBreakdown.catalogFreight || priceBreakdown.catalogLoadingCharges) && (
                <div className="border-t border-border pt-1.5">
                  <p className="text-[11px] text-muted">As per vendor price list (reference only):</p>
                  {priceBreakdown.catalogFreight && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Freight</span>
                      <span className="font-medium tabular-nums">{formatINR(priceBreakdown.catalogFreight)}</span>
                    </div>
                  )}
                  {priceBreakdown.catalogLoadingCharges && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Loading / unloading</span>
                      <span className="font-medium tabular-nums">{formatINR(priceBreakdown.catalogLoadingCharges)}</span>
                    </div>
                  )}
                </div>
              )}
              <p className="pt-1 text-[11px] text-muted">
                Real freight/loading vary per purchase order — see the PO history below for what was actually
                charged, not the catalog quote above.
              </p>
            </CardContent>
          </Card>
        )}

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

      {isAdmin && poHistory.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Purchase order history — rate, freight & loading</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR className="border-t-0">
                  <TH>PO</TH>
                  <TH>Vendor</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Freight</TH>
                  <TH className="text-right">Loading</TH>
                </TR>
              </THead>
              <TBody>
                {poHistory.map((p) => (
                  <TR key={p.poNo}>
                    <TD>
                      <div className="font-mono text-xs">{p.poNo}</div>
                      <div className="text-[11px] text-muted">{new Date(p.date).toLocaleDateString("en-IN")}</div>
                    </TD>
                    <TD className="text-sm">{p.vendor}</TD>
                    <TD className="text-right tabular-nums">{p.qty}</TD>
                    <TD className="text-right tabular-nums">{formatINR(p.rate)}</TD>
                    <TD className="text-right tabular-nums">{p.freight ? formatINR(p.freight) : "—"}</TD>
                    <TD className="text-right tabular-nums">{p.loadingCharges ? formatINR(p.loadingCharges) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
