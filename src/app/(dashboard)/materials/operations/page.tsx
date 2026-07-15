import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { itemOptions, listLocations, pendingRequestCount } from "@/server/services/materials";
import { PageHeader } from "@/components/ui/stat";
import { MaterialsNav } from "../materials-nav";
import { OperationsPanel } from "../operations-panel";

export const dynamic = "force-dynamic";

/** Materials → Operations. Move stock: transfer, issue to site, audit. Admin-only. */
export default async function OperationsPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") notFound();

  const [opts, locations, pending] = await Promise.all([
    itemOptions(session),
    listLocations(session),
    pendingRequestCount(session),
  ]);

  const locationOpts = locations.map((l) => ({ id: l.id, name: l.name, type: l.type as string }));

  return (
    <div>
      <PageHeader title="Stock operations" subtitle="Move material between locations, issue it to a site, or count it" />
      <MaterialsNav isAdmin requestCount={pending} />

      <OperationsPanel
        items={opts.map((i) => ({ id: i.id, name: i.name }))}
        locations={locationOpts.map((l) => ({ id: l.id, name: l.name }))}
        siteLocations={locationOpts.filter((l) => l.type === "SITE").map((l) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
