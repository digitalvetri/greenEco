import { PageHeader } from "@/components/ui/stat";
import { LeadForm } from "../lead-form";

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Lead" subtitle="Capture a new enquiry" />
      <LeadForm />
    </div>
  );
}
