import { api } from "@/lib/api";
import { listItems } from "@/server/services/materials";

/** Cursor pagination for the item/stock list ("Load more"). purchasePrice is stripped for EMPLOYEE by listItems. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listItems(session, {
    search: p.get("search") ?? undefined,
    category: p.get("category") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return {
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      unit: i.unit,
      total: i.total,
      byLocation: i.byLocation,
      lowStock: i.lowStock,
      purchasePrice: "purchasePrice" in i ? String((i as { purchasePrice: unknown }).purchasePrice ?? "") : undefined,
    })),
    nextCursor,
  };
});
