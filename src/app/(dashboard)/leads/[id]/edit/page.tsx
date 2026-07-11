import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLead } from "@/server/services/lead";
import { PageHeader } from "@/components/ui/stat";
import { LeadForm } from "../../lead-form";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const lead = await getLead(session, id);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit Lead" subtitle={lead.customerName} />
      <LeadForm
        mode="edit"
        leadId={lead.id}
        initial={{
          customerName: lead.customerName,
          address: lead.address,
          phone: lead.phone,
          email: lead.email ?? "",
          source: lead.source,
          requirement: lead.requirement ?? "",
          lat: lead.lat ?? undefined,
          lng: lead.lng ?? undefined,
          plantType: lead.plantType ?? "",
          technology: lead.technology ?? "",
          capacityKLD: lead.capacityKLD != null ? String(lead.capacityKLD) : "",
          segment: lead.segment ?? "",
          budgetBand: lead.budgetBand ?? "",
          decisionTimeline: lead.decisionTimeline ?? "",
          inletBOD: lead.inletBOD != null ? String(lead.inletBOD) : "",
          inletCOD: lead.inletCOD != null ? String(lead.inletCOD) : "",
          inletTSS: lead.inletTSS != null ? String(lead.inletTSS) : "",
          inletTDS: lead.inletTDS != null ? String(lead.inletTDS) : "",
        }}
      />
    </div>
  );
}
