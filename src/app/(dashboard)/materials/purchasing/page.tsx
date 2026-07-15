import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { itemOptions, listVendors, listLocations, listPOs, pendingRequestCount } from "@/server/services/materials";
import { PageHeader } from "@/components/ui/stat";
import { MaterialsNav } from "../materials-nav";
import { PurchasingPanel } from "../purchasing-panel";
import { VendorsSection } from "../vendors-section";

export const dynamic = "force-dynamic";

/** Materials → Purchasing. Admin-only (POs carry purchase rates). */
export default async function PurchasingPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") notFound();

  const [opts, vendors, locations, pos, pending] = await Promise.all([
    itemOptions(session),
    listVendors(session),
    listLocations(session),
    listPOs(session),
    pendingRequestCount(session),
  ]);

  return (
    <div>
      <PageHeader title="Purchasing" subtitle="Vendors, purchase orders and goods receipt" />
      <MaterialsNav isAdmin requestCount={pending} />

      <div className="mb-4">
        <VendorsSection
          vendors={vendors.map((v) => ({
            id: v.id,
            name: v.name,
            phone: v.phone,
            contact: v.contact,
            address: v.address,
            gstin: v.gstin,
            categories: v.categories,
          }))}
        />
      </div>

      <PurchasingPanel
        items={opts.map((i) => ({ id: i.id, name: i.name }))}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        pos={pos.map((p) => ({
          id: p.id,
          poNo: p.poNo,
          vendor: p.vendor.name,
          status: p.status,
          totalValue: p.totalValue.toString(),
          items: (p.items as { itemId: string; qty: number; rate: number }[]) ?? [],
          received: p.status === "RECEIVED" || p.status === "CLOSED",
        }))}
      />
    </div>
  );
}
