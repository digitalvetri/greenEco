import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProposal, proposalActivity } from "@/server/services/proposal";
import { ProposalEditor, type ProposalView } from "./proposal-editor";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [p, activity] = await Promise.all([getProposal(session, id), proposalActivity(session, id)]);
  if (!p) notFound();

  const isAdmin = session.role === "ADMIN";
  const current = p.versions.find((v) => v.versionNo === p.currentVersion) ?? p.versions[0];

  // Serialize Decimals → strings / Dates → ISO before crossing to the Client Component.
  const view: ProposalView = {
    id: p.id,
    number: p.number,
    status: p.status,
    projectName: p.projectName,
    siteAddress: p.siteAddress,
    plantType: p.plantType,
    technology: p.technology,
    capacityKLD: p.capacityKLD,
    lostReason: p.lostReason,
    order: p.order ? { id: p.order.id, orderNo: p.order.orderNo } : null,
    version: current
      ? {
          versionNo: current.versionNo,
          technicalText: current.technicalText,
          aiGenerated: current.aiGenerated,
          approved: !!current.approvedById,
          subtotal: current.subtotal.toString(),
          gstAmount: current.gstAmount.toString(),
          grandTotal: current.grandTotal.toString(),
          // estimatedCost is stripped for EMPLOYEE by the service (admin-only).
          estimatedCost:
            "estimatedCost" in current && current.estimatedCost != null
              ? current.estimatedCost.toString()
              : null,
          validityDays: current.validityDays,
          paymentTerms:
            (current.paymentTerms as Array<{
              description: string;
              percent: number;
              trigger: string;
            }>) ?? [],
          boqItems: current.boqItems.map((b) => ({
            id: b.id,
            category: b.category,
            item: b.item,
            specification: b.specification,
            unit: b.unit,
            qty: b.qty.toString(),
            rate: b.rate.toString(),
            amount: b.amount.toString(),
            aiSuggested: b.aiSuggested,
          })),
        }
      : null,
  };

  const documents = (p.documents ?? []).map((d) => ({ id: d.id, url: d.url, name: d.name }));

  return <ProposalEditor view={view} isAdmin={isAdmin} events={activity ?? []} documents={documents} />;
}
