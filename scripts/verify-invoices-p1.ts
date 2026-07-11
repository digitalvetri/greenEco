/**
 * Verifies Invoices P1 — real IGST via the customer state (setOrderGst → place-of-
 * supply), the GST-filing summary (nets negated credit notes, reconciles), the
 * collection summary (canonical receivables), and admin-only RBAC. Company state = 33.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createInvoiceFromMilestone, createCreditNote } from "@/server/services/invoice";
import { setOrderGst } from "@/server/services/order";
import { getGstSummary, getCollectionSummary, getReceivables } from "@/server/services/reports";

const created: string[] = [];
let restore: { orderId: string; stateCode: string | null; gstin: string | null } | null = null;

async function cleanup() {
  if (created.length) {
    await prisma.invoice.updateMany({ where: { id: { in: created } }, data: { creditNoteOfId: null } });
    await prisma.invoice.deleteMany({ where: { id: { in: created } } });
  }
  if (restore) await prisma.order.update({ where: { id: restore.orderId }, data: { clientStateCode: restore.stateCode, clientGstin: restore.gstin } });
}

async function expectThrow(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  const milestone = await prisma.paymentMilestone.findFirst({ where: { invoice: null, order: { companyId: A.companyId, deletedAt: null } }, include: { order: true } });
  if (!milestone) throw new Error("need an un-invoiced milestone");
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  restore = { orderId: milestone.orderId, stateCode: milestone.order.clientStateCode, gstin: milestone.order.clientGstin };

  // 1 — setOrderGst persists + audited; inter-state (07 ≠ company 33) → IGST.
  await setOrderGst(A, milestone.orderId, { clientStateCode: "07", clientGstin: "07abcde1234f1z5" });
  const savedOrder = await prisma.order.findUnique({ where: { id: milestone.orderId } });
  check("setOrderGst persists state + uppercased GSTIN", savedOrder?.clientStateCode === "07" && savedOrder?.clientGstin === "07ABCDE1234F1Z5");
  const gstAudit = await prisma.auditLog.findFirst({ where: { entity: "Order", entityId: milestone.orderId, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  check("setOrderGst audited", !!gstAudit);

  const igstRes = await createInvoiceFromMilestone(A, milestone.id);
  created.push(igstRes.invoiceId);
  const igstInv = (await prisma.invoice.findUnique({ where: { id: igstRes.invoiceId } }))!;
  const igb = igstInv.gstBreakup as { cgst: string; sgst: string; igst: string };
  check("inter-state supply → taxType IGST", igstInv.taxType === "IGST");
  check("IGST invoice has igst > 0 and cgst/sgst = 0", new Decimal(igb.igst).gt(0) && new Decimal(igb.cgst).equals(0) && new Decimal(igb.sgst).equals(0));

  // 2 — intra-state (33 == company) → CGST/SGST. (Reset to same state; delete first invoice — 1:1.)
  await prisma.invoice.deleteMany({ where: { id: igstRes.invoiceId } });
  created.pop();
  await setOrderGst(A, milestone.orderId, { clientStateCode: "33" });
  const cgstRes = await createInvoiceFromMilestone(A, milestone.id);
  created.push(cgstRes.invoiceId);
  const cgstInv = (await prisma.invoice.findUnique({ where: { id: cgstRes.invoiceId } }))!;
  const cgb = cgstInv.gstBreakup as { cgst: string; igst: string };
  check("intra-state supply → taxType CGST_SGST", cgstInv.taxType === "CGST_SGST");
  check("CGST invoice has cgst > 0 and igst = 0", new Decimal(cgb.cgst).gt(0) && new Decimal(cgb.igst).equals(0));

  // 3 — GST summary reconciles + nets a credit note.
  const before = await getGstSummary(A);
  const cnRes = await createCreditNote(A, cgstRes.invoiceId, "p1 verify net");
  created.push(cnRes.invoiceId);
  const after = await getGstSummary(A);
  check("GST summary grand reconciles (taxable+cgst+sgst+igst == total)", new Decimal(after.grand.taxable).plus(after.grand.cgst).plus(after.grand.sgst).plus(after.grand.igst).equals(new Decimal(after.grand.total)));
  check("credit note NETS the summary down (CN GST is negative)", new Decimal(after.grand.total).lt(new Decimal(before.grand.total)));
  check("GST summary invoice count rose by the CN", after.invoiceCount === before.invoiceCount + 1);

  // 4 — collection summary: outstanding is the canonical receivables figure.
  const col = await getCollectionSummary(A);
  const recv = await getReceivables(A);
  check("collection.outstanding == getReceivables.totalOutstanding (canonical)", col.outstanding === recv.totalOutstanding);
  const invAgg = await prisma.invoice.aggregate({ where: { companyId: A.companyId }, _sum: { total: true } });
  check("collection.invoicedNet == Σ invoice.total (nets CNs)", new Decimal(col.invoicedNet).equals(new Decimal(invAgg._sum.total ?? 0)));

  // 5 — RBAC: employee blocked from all P1 surfaces.
  check("EMPLOYEE blocked from setOrderGst", await expectThrow(() => setOrderGst(E, milestone.orderId, { clientStateCode: "07" })));
  check("EMPLOYEE blocked from getGstSummary", await expectThrow(() => getGstSummary(E)));
  check("EMPLOYEE blocked from getCollectionSummary", await expectThrow(() => getCollectionSummary(E)));

  await cleanup();
  console.log(`\n✅ Invoices P1 (IGST + GST report) verified — ${pass} checks passed`);
}
main().catch(async (e) => { console.error("❌", e.message); await cleanup(); process.exit(1); }).finally(() => prisma.$disconnect());
