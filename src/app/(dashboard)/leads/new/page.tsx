import { PageHeader } from "@/components/ui/stat";
import { NewLeadFlow } from "./new-lead-flow";

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Lead" subtitle="Capture a new enquiry — from a new or existing customer" />
      <NewLeadFlow />
    </div>
  );
}
