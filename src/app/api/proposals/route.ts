import { api } from "@/lib/api";
import { listProposals } from "@/server/services/proposal";

/** Cursor pagination for the proposals list ("Load more"). */
export const GET = api(async (session, req) => {
  const p = new URL(req.url).searchParams;
  const { items, nextCursor } = await listProposals(session, {
    status: p.get("status") ?? undefined,
    search: p.get("search") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: p.get("take") ? Number(p.get("take")) : undefined,
  });
  // Flatten to the row shape the client list expects.
  return {
    items: items.map((x) => {
      const v = x.versions[0];
      return {
        id: x.id,
        number: x.number,
        status: x.status,
        projectName: x.projectName,
        plantType: x.plantType,
        technology: x.technology,
        capacityKLD: x.capacityKLD,
        grandTotal: v ? String(v.grandTotal) : null,
        aiGenerated: v?.aiGenerated ?? false,
        orderNo: x.order?.orderNo ?? null,
        expiry: x.expiry,
      };
    }),
    nextCursor,
  };
});
