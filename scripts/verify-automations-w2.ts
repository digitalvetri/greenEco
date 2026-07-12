/**
 * Verifies Wave 2 A4 (payment reminders) + A5 (draft invoice). A5: draftInvoiceForMilestone
 * creates a DRAFT that is EXCLUDED from the GST summary until issueDraftInvoice assigns a real
 * number (then included). A4: a milestone due in +3d with a client phone yields a dry-run log
 * for offset 3. Uses a real un-invoiced milestone; reverts all changes.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { draftInvoiceForMilestone, issueDraftInvoice } from "@/server/services/invoice";
import { getGstSummary } from "@/server/services/reports";
import { runAutomation } from "@/server/automations/engine";
import { registerAll } from "@/server/automations";
import { addDays } from "@/server/automations/util";

async function main() {
  registerAll();
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const milestone = await prisma.paymentMilestone.findFirst({
    where: { invoice: null, receipts: { none: {} }, order: { companyId: A.companyId, deletedAt: null } },
    include: { order: true },
  });
  if (!milestone) throw new Error("need an un-invoiced milestone (run verify-execute)");

  let createdInvoiceId: string | null = null;
  const restore = { orderId: milestone.orderId, phone: milestone.order.clientPhone, dueDate: milestone.dueDate, status: milestone.status };
  try {
    // ── A5 ──
    const gstBefore = await getGstSummary(A);
    const draft = await draftInvoiceForMilestone(A, milestone.id);
    createdInvoiceId = draft?.invoiceId ?? null;
    check("A5 creates a DRAFT invoice", !!draft?.draft && !!createdInvoiceId);
    const draftRow = await prisma.invoice.findUnique({ where: { id: createdInvoiceId! } });
    check("draft has status DRAFT + placeholder number", draftRow?.status === "DRAFT" && draftRow?.invoiceNo.startsWith("DRAFT-"));
    const gstWithDraft = await getGstSummary(A);
    check("DRAFT is excluded from the GST summary", gstWithDraft.grand.total === gstBefore.grand.total);

    const idem = await draftInvoiceForMilestone(A, milestone.id);
    check("A5 is idempotent (no second draft)", idem?.already === true);

    const issued = await issueDraftInvoice(A, createdInvoiceId!);
    check("issue assigns a real GEC-INV number", issued.invoiceNo.includes("GEC-INV"));
    const issuedRow = await prisma.invoice.findUnique({ where: { id: createdInvoiceId! } });
    check("issued invoice is status ISSUED", issuedRow?.status === "ISSUED");
    const gstAfter = await getGstSummary(A);
    check("issued invoice IS now in the GST summary", gstAfter.grand.total !== gstBefore.grand.total);

    // remove the test invoice before A4 (so the milestone is un-invoiced again)
    await prisma.invoice.delete({ where: { id: createdInvoiceId! } });
    createdInvoiceId = null;

    // ── A4 ──
    await prisma.order.update({ where: { id: milestone.orderId }, data: { clientPhone: "9000000004" } });
    await prisma.paymentMilestone.update({ where: { id: milestone.id }, data: { dueDate: addDays(new Date(), 3), status: "DUE" } });
    const dry = await runAutomation("payment-reminders", { companyId: A.companyId, now: new Date(), dryRun: true });
    check("A4 dry-run computes reminders", (dry.details as { inWindow?: boolean }) != null);
    const dryLog = await prisma.automationLog.findUnique({ where: { dedupeKey: `dry:A4:${milestone.id}:3` } });
    check("A4 logs a +3d reminder for the due milestone", dryLog?.status === "DRY_RUN");
    await prisma.automationLog.deleteMany({ where: { dedupeKey: { startsWith: `dry:A4:${milestone.id}:` } } });
  } finally {
    if (createdInvoiceId) await prisma.invoice.delete({ where: { id: createdInvoiceId } }).catch(() => {});
    await prisma.order.update({ where: { id: restore.orderId }, data: { clientPhone: restore.phone } });
    await prisma.paymentMilestone.update({ where: { id: milestone.id }, data: { dueDate: restore.dueDate, status: restore.status } });
  }

  console.log(`\n✅ Wave 2 (A4 + A5) verified — ${pass} checks passed`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
