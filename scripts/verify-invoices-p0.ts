/**
 * Verifies Invoices P0 — the money-critical credit-note fixes (reconciliation
 * invariant, negated GST, sign, creditNoteOfId, over-reversal + CN-of-CN guards,
 * audit), the addReceipt over-payment guard, the dedup-after-tenant-scope, and list
 * pagination + invoiceStats. Fixtures are cleaned up (idempotent).
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { DEV_ADMIN_ID } from "@/lib/env";
import {
  createInvoiceFromMilestone,
  createCreditNote,
  listInvoices,
  invoiceStats,
} from "@/server/services/invoice";
import { addReceipt } from "@/server/services/order";

const created: string[] = [];
async function cleanup() {
  if (created.length) {
    await prisma.invoice.updateMany({ where: { id: { in: created } }, data: { creditNoteOfId: null } });
    await prisma.invoice.deleteMany({ where: { id: { in: created } } });
  }
}

async function expectThrow(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const milestone = await prisma.paymentMilestone.findFirst({ where: { invoice: null, order: { companyId: A.companyId } }, include: { receipts: true } });
  if (!milestone) throw new Error("need an un-invoiced milestone");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  // 1 — mint the original invoice; dedup holds after the companyId-scoped lookup.
  const origRes = await createInvoiceFromMilestone(A, milestone.id);
  created.push(origRes.invoiceId);
  check("invoice minted with a number", !origRes.already && "invoiceNo" in origRes);
  const dupe = await createInvoiceFromMilestone(A, milestone.id);
  check("dedup guard holds after tenant-scoped lookup (already:true)", dupe.already === true && dupe.invoiceId === origRes.invoiceId);
  const orig = (await prisma.invoice.findUnique({ where: { id: origRes.invoiceId } }))!;

  // 2 — credit note: reconciliation invariant + sign (this is exactly what was broken).
  const cnRes = await createCreditNote(A, orig.id, "verify reversal");
  created.push(cnRes.invoiceId);
  const cn = (await prisma.invoice.findUnique({ where: { id: cnRes.invoiceId } }))!;
  const gb = cn.gstBreakup as { cgst: string; sgst: string; igst: string; rate: number };
  const lineSum = ((cn.lineItems as Array<{ amount: string }>) ?? []).reduce((a, l) => a.plus(new Decimal(l.amount)), new Decimal(0));
  const gstSum = new Decimal(gb.cgst).plus(gb.sgst).plus(gb.igst);
  const total = new Decimal(cn.total);
  check("CN reconciles: lineItems + (cgst+sgst+igst) === total", lineSum.plus(gstSum).equals(total));
  check("CN total is negative and = −original", total.equals(new Decimal(orig.total).negated()) && total.lt(0));
  check("CN GST components are ≤ 0 (negated, not copied positive)", new Decimal(gb.cgst).lte(0) && new Decimal(gb.sgst).lte(0) && new Decimal(gb.igst).lte(0));
  check("CN line item is ≤ 0 (taxable-exclusive, not tax-inclusive)", lineSum.lte(0));
  const og = orig.gstBreakup as { cgst: string; sgst: string; igst: string };
  check("CN GST = −original GST component-wise", new Decimal(gb.cgst).equals(new Decimal(og.cgst).negated()) && new Decimal(gb.sgst).equals(new Decimal(og.sgst).negated()));
  check("CN links to the original (creditNoteOfId)", cn.creditNoteOfId === orig.id);
  check("CN does NOT copy milestoneId (unique 1:1)", cn.milestoneId === null);
  const cnAudit = await prisma.auditLog.findFirst({ where: { entity: "Invoice", entityId: cn.id, action: "CREATE" } });
  check("CN is audited (was unaudited)", !!cnAudit);

  // 3 — guards.
  check("over-reversal blocked (second CN on same invoice)", await expectThrow(() => createCreditNote(A, orig.id, "again")));
  check("CN-of-CN blocked", await expectThrow(() => createCreditNote(A, cn.id, "of cn")));

  // 4 — addReceipt over-payment / sign guard (throwing paths only — no mutation).
  const paid = milestone.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
  const outstanding = new Decimal(milestone.amount).minus(paid);
  check("receipt exceeding balance is blocked", await expectThrow(() => addReceipt(A, milestone.id, { date: new Date(), amount: outstanding.plus(1000).toNumber(), mode: "NEFT" })));
  check("negative receipt is blocked", await expectThrow(() => addReceipt(A, milestone.id, { date: new Date(), amount: -100, mode: "NEFT" })));

  // 5 — list pagination + stats.
  const listed = await listInvoices(A, { take: 1 });
  check("listInvoices returns {items,nextCursor}", Array.isArray(listed.items) && "nextCursor" in listed);
  const s = await invoiceStats(A);
  const rawCount = await prisma.invoice.count({ where: { companyId: A.companyId } });
  check(`invoiceStats.count matches DB (${s.count}==${rawCount})`, s.count === rawCount);
  check("invoiceStats.creditNotes ≥ 1 (our fixture)", s.creditNotes >= 1);

  await cleanup();
  console.log(`\n✅ Invoices P0 verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
