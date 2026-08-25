import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClient360, listClientProjectTabs } from "@/server/services/client";
import { getOrderFinancials } from "@/server/services/order";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { displayProposalNumber } from "@/lib/domain/proposal-aging";
import { ClientDetailsEditor } from "./client-details-editor";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  const lead = await prisma.lead.findFirst({ where: { id, companyId: session.companyId }, select: { customerName: true } });
  return { title: lead ? `${lead.customerName} — Green Ecocare CRM` : "Client — Green Ecocare CRM" };
}

const KIND_LABEL: Record<string, string> = {
  lead: "🟢",
  followup: "📞",
  proposal: "📄",
  order: "🏗️",
  receipt: "💰",
  invoice: "🧾",
};

export default async function Client360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [data, tabs] = await Promise.all([getClient360(session, id), listClientProjectTabs(session, id)]);
  if (!data) notFound();
  const { lead, timeline, primaryProposalId } = data;
  // A lead now carries several proposals (one per type). `proposal` is the
  // representative one the service already picked (won, else newest) and drives the
  // headline cards; `lead.proposals` below lists every quote so none is hidden.
  const proposal = lead.proposals.find((p) => p.id === primaryProposalId) ?? null;
  const order = proposal?.order;
  const isAdmin = session.role === "ADMIN";
  const hasMultipleProjects = tabs.length > 1;
  const financials = isAdmin && order ? await getOrderFinancials(session, order.id) : null;

  return (
    <div>
      <PageHeader
        title={lead.customerName}
        subtitle={hasMultipleProjects ? `Client 360 · ${tabs.length} projects` : "Client 360"}
        backHref="/clients"
      />

      {hasMultipleProjects && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const active = t.id === id;
            return (
              <Link
                key={t.id}
                href={`/clients/${t.id}`}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
                }
              >
                {t.label}
                {(t.orderNo || t.proposalNo) && <span className="opacity-70"> · {t.orderNo ?? t.proposalNo}</span>}
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <ClientDetailsEditor
              leadId={lead.id}
              customerName={lead.customerName}
              phone={lead.phone}
              email={lead.email ?? ""}
              address={lead.address}
              source={lead.source}
              contacts={lead.contacts.map((c) => ({
                id: c.id,
                name: c.name,
                designation: c.designation,
                mobile: c.mobile,
              }))}
            />
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Phone" value={lead.phone} />
            {lead.email && <Row label="Email" value={lead.email} />}
            <Row label="Address" value={lead.address} />
            <Row label="Source" value={lead.source} />
            {lead.contacts.length > 0 && (
              <div className="border-t border-border pt-1">
                {lead.contacts.map((c) => (
                  <Row
                    key={c.id}
                    label={c.designation || "Contact"}
                    value={`${c.name} · ${c.mobile}`}
                  />
                ))}
              </div>
            )}
            {lead.reference && <Row label="Referred by" value={lead.reference.name} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {lead.proposals.length > 0 ? (
              <>
                {/* Every quote raised for this site, not just the primary one. */}
                {lead.proposals.map((p) => (
                  <Row
                    key={p.id}
                    label={p.proposalType ?? "Proposal"}
                    value={`${displayProposalNumber(p.status, p.number)} · ${p.status}`}
                  />
                ))}
                {order && <Row label="Order" value={order.orderNo} />}
                {isAdmin && order && <Row label="Value" value={formatINR(order.projectValue.toString())} />}
              </>
            ) : (
              <span className="text-muted">No proposal yet.</span>
            )}
          </CardContent>
        </Card>
      </div>

      {order && (
        <div className="mt-4 flex gap-2">
          <Link href={`/projects/${order.id}`}>
            <Badge variant="primary">Open project →</Badge>
          </Link>
          {proposal && (
            <Link href={`/proposals/${proposal.id}`}>
              <Badge variant="default">Proposal →</Badge>
            </Link>
          )}
        </div>
      )}

      {/* What this project actually is — plant type/technology/capacity/inlet quality,
          so an admin can understand the client's work from this one page, not just codes. */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Project description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Project" value={proposal?.projectName ?? lead.projectName ?? lead.customerName} />
          <Row label="Plant type" value={proposal?.plantType ?? lead.plantType ?? "Not specified"} />
          <Row label="Technology" value={proposal?.technology ?? lead.technology ?? "Not specified"} />
          <Row
            label="Capacity"
            value={
              (proposal?.capacityKLD ?? lead.capacityKLD) != null
                ? `${proposal?.capacityKLD ?? lead.capacityKLD} KLD`
                : "Not specified"
            }
          />
          {lead.segment && <Row label="Segment" value={lead.segment} />}
          <Row label="Site address" value={proposal?.siteAddress ?? lead.projectAddress ?? lead.address} />
          {(lead.inletBOD || lead.inletCOD || lead.inletTSS || lead.inletTDS) && (
            <Row
              label="Inlet quality (mg/l)"
              value={[
                lead.inletBOD ? `BOD ${lead.inletBOD}` : null,
                lead.inletCOD ? `COD ${lead.inletCOD}` : null,
                lead.inletTSS ? `TSS ${lead.inletTSS}` : null,
                lead.inletTDS ? `TDS ${lead.inletTDS}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {lead.requirement && (
            <div className="border-t border-border pt-1">
              <span className="text-muted">Requirement / notes</span>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{lead.requirement}</p>
            </div>
          )}
          {order && (
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className="text-muted">Execution progress</span>
                <span className="text-xs font-medium">
                  {order.stages.filter((s) => s.status === "DONE").length}/{order.stages.length} stages
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-border">
                <div
                  className="h-full rounded bg-primary"
                  style={{
                    width: `${order.stages.length ? Math.round((order.stages.filter((s) => s.status === "DONE").length / order.stages.length) * 100) : 0}%`,
                  }}
                />
              </div>
              {(order.startDate || order.targetDate) && (
                <div className="mt-1.5 flex justify-between text-xs text-muted">
                  {order.startDate && <span>Started {new Date(order.startDate).toLocaleDateString("en-IN")}</span>}
                  {order.targetDate && <span>Target {new Date(order.targetDate).toLocaleDateString("en-IN")}</span>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial — Advance Received / Invoice Raised / Payment Received per project. Admin-only, money. */}
      {financials && order && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Financial</CardTitle>
            <DownloadPdfButton docType="payment-statement" docId={order.id} label="Payment statement" />
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted">Advance Received</div>
              <div className="mt-0.5 font-semibold">{formatINR(financials.advanceReceived)}</div>
            </div>
            <div>
              <div className="text-muted">Invoice Raised</div>
              <div className="mt-0.5 font-semibold">{formatINR(financials.invoiceRaised)}</div>
            </div>
            <div>
              <div className="text-muted">Payment Received</div>
              <div className="mt-0.5 font-semibold text-ok">{formatINR(financials.paymentReceived)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Every project this client has done with us — not just the current tab. */}
      {hasMultipleProjects && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>All projects with this client ({tabs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={`/clients/${t.id}`}
                className={
                  "block rounded-lg border p-3 text-sm transition-colors " +
                  (t.id === id ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.projectName ?? t.label}</span>
                  <div className="flex items-center gap-1.5">
                    {t.orderStatus && <Badge variant={t.orderStatus === "COMPLETED" ? "primary" : "default"}>{t.orderStatus}</Badge>}
                    <span className="text-xs text-muted">{t.status}</span>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  {t.plantType && <span>{t.plantType}</span>}
                  {t.technology && <span>{t.technology}</span>}
                  {t.capacityKLD != null && <span>{t.capacityKLD} KLD</span>}
                  {(t.orderNo || t.proposalNo) && <span>{t.orderNo ?? t.proposalNo}</span>}
                  {isAdmin && t.projectValue && <span className="font-semibold">{formatINR(t.projectValue)}</span>}
                </div>
                {t.progress != null && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-border">
                    <div className="h-full rounded bg-primary" style={{ width: `${t.progress}%` }} />
                  </div>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">
        {hasMultipleProjects ? "Timeline — this project only" : "Timeline"} ({timeline.length})
      </h2>
      <div className="space-y-1.5">
        {timeline.map((t, i) => (
          <Card key={i} className="flex items-start gap-3 p-3">
            <span className="text-lg">{KIND_LABEL[t.kind] ?? "•"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-[11px] text-muted">{new Date(t.at).toLocaleDateString("en-IN")}</span>
              </div>
              {t.detail && <p className="truncate text-xs text-muted">{t.detail}</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
