import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Flame, MapPin, Mail, Phone as PhoneIcon, AlertTriangle, Clock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getLeadCustomer } from "@/server/services/lead";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function statusVariant(s: string) {
  if (s === "CONVERTED") return "ok" as const;
  if (s === "LOST") return "danger" as const;
  if (s === "ON_HOLD") return "warn" as const;
  return "primary" as const;
}

/**
 * A customer's projects, each shown as its own section (spec: don't merge multiple
 * enquiries into one card). Each section is a summary + a link into the existing
 * single-lead detail page (/leads/[id]) — which already has the full follow-up/
 * proposal/BOQ/timeline machinery — rather than re-implementing that here.
 */
export default async function LeadCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const customer = await getLeadCustomer(session, id);
  if (!customer) notFound();

  return (
    <div>
      <PageHeader title={customer.customerName} subtitle={`${customer.projects.length} project${customer.projects.length === 1 ? "" : "s"}`} />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <PhoneIcon className="size-4 text-muted" />
            <a href={`tel:${customer.phone}`} className="font-medium text-primary hover:underline">
              {customer.phone}
            </a>
          </span>
          {customer.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-4 text-muted" /> {customer.email}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-muted" /> {customer.address}
          </span>
        </div>
      </Card>

      <div className="space-y-3">
        {customer.projects.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{p.label}</span>
                <Badge variant={statusVariant(p.status)}>{p.status.replace(/_/g, " ")}</Badge>
                {p.temperature !== "COLD" && !["CONVERTED", "LOST"].includes(p.status) && (
                  <Badge variant={p.temperature === "HOT" ? "danger" : "warn"}>
                    <Flame className="size-3" /> {p.temperature === "HOT" ? "Hot" : "Warm"}
                  </Badge>
                )}
                {p.urgency && (
                  <Badge variant={p.urgency.kind === "overdue" ? "danger" : "warn"}>
                    {p.urgency.kind === "overdue" ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
                    {p.urgency.label}
                  </Badge>
                )}
              </div>
              <Link href={`/leads/${p.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                View full details <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <CardContent className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 p-0 text-xs text-muted sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-4">
                <div className="text-[10px] uppercase tracking-wide">Site address</div>
                <div className="font-medium text-foreground">{p.address}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Source</div>
                <div className="font-medium text-foreground">{p.source}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Owner</div>
                <div className="font-medium text-foreground">{p.assignedToName}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Next follow-up</div>
                <div className="font-medium text-foreground">
                  {p.nextFollowUpDate ? new Date(p.nextFollowUpDate).toLocaleDateString("en-IN") : "— not set"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Estimated value</div>
                <div className="font-medium text-foreground">
                  {p.estimatedValue ? `~₹${(p.estimatedValue.mid / 100000).toFixed(1)}L` : "—"}
                </div>
              </div>
              {p.proposalNumber && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-[10px] uppercase tracking-wide">Proposal</div>
                  <div className="font-medium text-foreground">
                    {p.proposalNumber} · {p.proposalStatus?.replace(/_/g, " ")}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
