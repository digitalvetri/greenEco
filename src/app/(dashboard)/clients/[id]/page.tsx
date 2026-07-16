import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClient360, listClientProjectTabs } from "@/server/services/client";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { ClientDetailsEditor } from "./client-details-editor";

export const dynamic = "force-dynamic";

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
  const { lead, timeline } = data;
  const proposal = lead.proposal;
  const order = proposal?.order;
  const isAdmin = session.role === "ADMIN";
  const hasMultipleProjects = tabs.length > 1;

  return (
    <div>
      <PageHeader
        title={lead.customerName}
        subtitle={hasMultipleProjects ? `Client 360 · ${tabs.length} projects` : "Client 360"}
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
            {proposal ? (
              <>
                <Row label="Proposal" value={proposal.number} />
                <Row label="Status" value={proposal.status} />
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
