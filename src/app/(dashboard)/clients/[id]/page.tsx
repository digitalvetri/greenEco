import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClient360 } from "@/server/services/client";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";

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
  const data = await getClient360(session, id);
  if (!data) notFound();
  const { lead, timeline } = data;
  const proposal = lead.proposal;
  const order = proposal?.order;
  const isAdmin = session.role === "ADMIN";

  return (
    <div className="max-w-3xl">
      <PageHeader title={lead.customerName} subtitle="Client 360" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Phone" value={lead.phone} />
            {lead.email && <Row label="Email" value={lead.email} />}
            <Row label="Address" value={lead.address} />
            <Row label="Source" value={lead.source} />
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

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Timeline ({timeline.length})</h2>
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
