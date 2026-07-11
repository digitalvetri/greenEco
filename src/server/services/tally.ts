import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { Ctx } from "@/lib/rbac";

/**
 * Tally-import export: GST invoices → Tally "Vouchers" XML (Sales + Credit Note
 * vouchers with party / Sales / Output-CGST/SGST/IGST ledger entries). Import in
 * Tally via Gateway → Import Data → Vouchers. Admin only.
 *
 * Tally sign convention: debits are negative, credits positive. On a sale the party
 * (debtor) is debited (−total) and Sales + output tax are credited (+). Credit notes
 * store negative amounts, so the same formula flips the signs correctly.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tallyDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function buildTallyXml(ctx: Ctx, range?: { from?: Date; to?: Date }): Promise<{ xml: string; count: number }> {
  requireAdmin(ctx);
  const [company, invoices] = await Promise.all([
    prisma.company.findUnique({ where: { id: ctx.companyId }, select: { name: true } }),
    prisma.invoice.findMany({
      where: {
        companyId: ctx.companyId,
        ...(range?.from || range?.to
          ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      orderBy: { date: "asc" },
    }),
  ]);
  // Invoice has no `order` relation (bare orderId) — resolve client names in one pass.
  const orders = await prisma.order.findMany({
    where: { id: { in: [...new Set(invoices.map((i) => i.orderId))] } },
    select: { id: true, clientName: true },
  });
  const clientName = new Map(orders.map((o) => [o.id, o.clientName]));

  const led = (name: string, amount: Decimal, deemedPositive: boolean) =>
    `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${deemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`;

  const vouchers = invoices.map((inv) => {
    const gb = (inv.gstBreakup ?? {}) as { cgst?: string; sgst?: string; igst?: string };
    const cgst = new Decimal(gb.cgst ?? 0);
    const sgst = new Decimal(gb.sgst ?? 0);
    const igst = new Decimal(gb.igst ?? 0);
    const total = new Decimal(inv.total);
    const taxable = total.minus(cgst).minus(sgst).minus(igst);
    const vchType = inv.isCreditNote ? "Credit Note" : "Sales";
    const name = clientName.get(inv.orderId) || "Cash";
    const party = esc(name);

    const entries = [
      led(name, total.negated(), true), // party — debit
      led("Sales", taxable, false), // sales — credit
    ];
    if (!cgst.isZero()) entries.push(led("Output CGST", cgst, false));
    if (!sgst.isZero()) entries.push(led("Output SGST", sgst, false));
    if (!igst.isZero()) entries.push(led("Output IGST", igst, false));

    return `      <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tallyDate(inv.date)}</DATE>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(inv.invoiceNo)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>
        <PARTYNAME>${party}</PARTYNAME>
        <ISINVOICE>Yes</ISINVOICE>
${entries.join("\n")}
      </VOUCHER>`;
  });

  const companyName = esc(company?.name ?? "Green Ecocare");
  const messages = vouchers.map((v) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${v}\n    </TALLYMESSAGE>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
${messages}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

  return { xml, count: invoices.length };
}
