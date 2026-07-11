import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, User, Activity, Flame, FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getLead, listCompanyUsers, leadActivity } from "@/server/services/lead";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { FollowUpForm } from "./follow-up-form";
import { ConvertButton } from "./convert-button";
import { AssignControl } from "./assign-control";
import { LeadStatusControl } from "./status-control";
import { ActivityTimeline } from "./activity-timeline";
import { CommPanel } from "./comm-panel";
import { DocumentsCard } from "./documents-card";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const [lead, members, activity] = await Promise.all([
    getLead(session, id),
    isAdmin ? listCompanyUsers(session) : Promise.resolve([]),
    leadActivity(session, id),
  ]);
  if (!lead) notFound();

  const converted = lead.status === "CONVERTED";
  const events = activity ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={lead.customerName}
        subtitle={`${lead.source} · ${lead.address}`}
        action={
          <Link
            href={`/leads/${lead.id}/edit`}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Pencil className="size-4" /> Edit
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={converted ? "ok" : "primary"}>{lead.status.replace(/_/g, " ")}</Badge>
        {/* Temperature is only meaningful while a lead is in play, not once won/lost. */}
        {!converted && lead.status !== "LOST" && (
          <Badge variant={lead.score.temperature === "HOT" ? "danger" : lead.score.temperature === "WARM" ? "warn" : "default"}>
            <Flame className="size-3" /> {lead.score.temperature[0] + lead.score.temperature.slice(1).toLowerCase()} · {lead.score.score}
          </Badge>
        )}
        {lead.proposal && (
          <Link href={`/proposals/${lead.proposal.id}`}>
            <Badge variant="review">Proposal {lead.proposal.number} →</Badge>
          </Link>
        )}
        <div className="ml-auto">
          {isAdmin ? (
            <AssignControl leadId={lead.id} members={members} currentOwnerId={lead.assignedToId} />
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <User className="size-3" /> {lead.assignedToName}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CommPanel leadId={lead.id} hasEmail={!!lead.email} />
        <LeadStatusControl leadId={lead.id} status={lead.status} isAdmin={isAdmin} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Phone</span>
              <span className="flex items-center gap-2">
                <a href={`tel:${lead.phone}`} className="font-medium text-primary hover:underline">
                  {lead.phone}
                </a>
                <a
                  href={`https://wa.me/91${lead.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open WhatsApp"
                  className="text-ok"
                >
                  <MessageCircle className="size-4" />
                </a>
              </span>
            </div>
            {lead.email && <Row label="Email" value={lead.email} />}
            {lead.requirement && <Row label="Requirement" value={lead.requirement} />}
            {lead.reference && <Row label="Referred by" value={lead.reference.name} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.contacts.length === 0 && <span className="text-muted">No contacts</span>}
            {lead.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <span>
                  {c.name}
                  {c.designation ? ` · ${c.designation}` : ""}
                </span>
                <a href={`tel:${c.mobile}`} className="text-primary">
                  {c.mobile}
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {(lead.plantType || lead.capacityKLD || lead.segment || lead.inletBOD) && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Plant sizing</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {lead.plantType && <Row label="Plant type" value={lead.plantType} />}
            {lead.technology && <Row label="Technology" value={lead.technology} />}
            {lead.capacityKLD != null && <Row label="Capacity" value={`${lead.capacityKLD} KLD`} />}
            {lead.segment && <Row label="Segment" value={lead.segment} />}
            {lead.budgetBand && <Row label="Budget" value={lead.budgetBand} />}
            {lead.decisionTimeline && <Row label="Timeline" value={lead.decisionTimeline} />}
            {lead.inletBOD != null && <Row label="Inlet BOD" value={`${lead.inletBOD} mg/l`} />}
            {lead.inletCOD != null && <Row label="Inlet COD" value={`${lead.inletCOD} mg/l`} />}
            {lead.inletTSS != null && <Row label="Inlet TSS" value={`${lead.inletTSS} mg/l`} />}
            {lead.inletTDS != null && <Row label="Inlet TDS" value={`${lead.inletTDS} mg/l`} />}
          </CardContent>
        </Card>
      )}

      {lead.boqPreview && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <FileText className="size-4" /> Indicative value (pre-quote)
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {formatINR(String(lead.boqPreview.low))} – {formatINR(String(lead.boqPreview.high))}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Scaled from the {lead.boqPreview.band} KLD template · a full BOQ is generated on conversion.
            Estimate only, not a firm quote.
          </p>
        </div>
      )}

      <DocumentsCard leadId={lead.id} documents={lead.documents} />

      {!converted && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
          <span className="text-sm">Ready to quote? Convert this lead into a proposal.</span>
          <ConvertButton leadId={lead.id} />
        </div>
      )}

      {!converted && (
        <div className="mt-4">
          <FollowUpForm leadId={lead.id} />
        </div>
      )}

      <h2 className="mb-3 mt-6 text-sm font-semibold text-muted">Activity ({events.length})</h2>
      {events.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Follow-ups, edits, and status changes will appear here." />
      ) : (
        <ActivityTimeline events={events} leadId={lead.id} />
      )}
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
