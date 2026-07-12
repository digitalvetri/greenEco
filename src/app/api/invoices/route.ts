import { api } from "@/lib/api";
import { listInvoices } from "@/server/services/invoice";

/** Cursor pagination for the invoice list ("Load more"). Admin-only via listInvoices. */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listInvoices(session, {
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  return {
    items: items.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      taxType: inv.taxType,
      total: inv.total.toString(),
      date: inv.date.toISOString(),
      isCreditNote: inv.isCreditNote,
      status: inv.status,
    })),
    nextCursor,
  };
});
