import Link from "next/link";
import { Phone, Store, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ITEM_CATEGORIES, categoryLabel } from "@/lib/constants";

export type VendorRow = {
  id: string;
  name: string;
  phone: string;
  contact: string | null;
  address: string | null;
  gstin: string | null;
  categories: string[];
};

/**
 * Vendors grouped by the category each one supplies, so — while browsing a material
 * category — the relevant suppliers are right there. Honours the page's category tab:
 * when a category is active, only that group is shown.
 */
export function VendorsSection({
  vendors,
  activeCategory,
}: {
  vendors: VendorRow[];
  activeCategory?: string;
}) {
  const groups = (activeCategory ? [activeCategory] : [...ITEM_CATEGORIES]).map((cat) => ({
    key: cat,
    label: categoryLabel(cat),
    vendors: vendors.filter((v) => v.categories.includes(cat)),
  }));

  // Vendors not tagged to any known category (only when showing everything).
  const uncategorized = activeCategory
    ? []
    : vendors.filter((v) => !v.categories.some((c) => (ITEM_CATEGORIES as readonly string[]).includes(c)));

  const anyShown = groups.some((g) => g.vendors.length > 0) || uncategorized.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <Store className="size-3.5" /> Vendors
            {activeCategory && (
              <span className="font-normal normal-case tracking-normal text-muted">
                · {categoryLabel(activeCategory)}
              </span>
            )}
          </span>
        </CardTitle>
        {activeCategory && (
          <Link href="/materials" className="text-xs font-medium text-primary hover:underline">
            Show all categories
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {vendors.length === 0 ? (
          <EmptyState icon={Store} title="No vendors yet" description="Add vendors below to see them grouped by category." />
        ) : !anyShown ? (
          <p className="py-4 text-center text-sm text-muted">
            No vendors supply {activeCategory ? categoryLabel(activeCategory) : "this category"} yet.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) =>
              g.vendors.length === 0 ? null : (
                <div key={g.key}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
                    <span className="text-[11px] text-muted">({g.vendors.length})</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.vendors.map((v) => (
                      <VendorCard key={v.id} v={v} />
                    ))}
                  </div>
                </div>
              ),
            )}
            {uncategorized.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Other</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {uncategorized.map((v) => (
                    <VendorCard key={v.id} v={v} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendorCard({ v }: { v: VendorRow }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{v.name}</span>
        {v.gstin && <Badge>GST</Badge>}
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-muted">
        {v.contact && (
          <div className="inline-flex items-center gap-1">
            <User className="size-3" /> {v.contact}
          </div>
        )}
        <div>
          <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
            <Phone className="size-3" /> {v.phone}
          </a>
        </div>
        {v.categories.length > 1 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {v.categories.map((c) => (
              <span key={c} className="rounded-full bg-card px-1.5 py-0.5 text-[10px] ring-1 ring-border">
                {categoryLabel(c)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
