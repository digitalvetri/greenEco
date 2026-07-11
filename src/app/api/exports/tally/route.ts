import { getSession, AuthError } from "@/lib/auth";
import { buildTallyXml } from "@/server/services/tally";

export const dynamic = "force-dynamic";

/**
 * Tally voucher export (GST invoices → Tally XML). Admin only (enforced inside
 * buildTallyXml). Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD range. Streams the XML
 * as a file download for Tally's Import Data → Vouchers.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    const p = new URL(req.url).searchParams;
    const from = p.get("from") ? new Date(p.get("from")!) : undefined;
    const to = p.get("to") ? new Date(p.get("to")!) : undefined;
    const { xml } = await buildTallyXml(session, { from, to });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="tally-vouchers-${stamp}.xml"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: e.status });
    return new Response("Export failed", { status: 500 });
  }
}
