import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getOrder, updateStage, addReceipt } from "@/server/services/order";
import { createInvoiceFromMilestone } from "@/server/services/invoice";
import { getReceivables } from "@/server/services/reports";

const ctx = { userId: "dev-admin", role: "ADMIN" as const, companyId: env.companyId };

async function main() {
  const order = await prisma.order.findFirst({
    where: { companyId: env.companyId },
    orderBy: { createdAt: "desc" },
    include: { stages: true, milestones: true },
  });
  if (!order) throw new Error("No order — run verify-sell first");
  console.log("Order:", order.orderNo, "value", order.projectValue.toString());

  // 1. Mark first stage DONE.
  const stage = order.stages.sort((a, b) => a.seq - b.seq)[0];
  await updateStage(ctx, stage.id, { status: "DONE" });
  const after = await getOrder(ctx, order.id);
  console.log("1. Progress after 1 stage DONE:", after!.progress + "%");

  // 2. Record a receipt on milestone 1 (partial).
  const m1 = order.milestones.sort((a, b) => a.seq - b.seq)[0];
  await addReceipt(ctx, m1.id, { date: new Date(), amount: Math.round(Number(m1.amount) / 2), mode: "NEFT" });
  const m1After = await prisma.paymentMilestone.findUnique({ where: { id: m1.id } });
  console.log("2. Milestone 1 status after half receipt:", m1After!.status);

  // 3. Full receipt → PAID. Pay the EXACT remaining balance (paying round(amount/2)
  // twice over-pays an odd amount by ₹1 — correctly blocked by the over-payment guard).
  const remaining = Number(m1.amount) - Math.round(Number(m1.amount) / 2);
  await addReceipt(ctx, m1.id, { date: new Date(), amount: remaining, mode: "UPI" });
  const m1Paid = await prisma.paymentMilestone.findUnique({ where: { id: m1.id } });
  console.log("   Milestone 1 status after full receipt:", m1Paid!.status);

  // 4. GST invoice from milestone 2 (intra-state → CGST+SGST).
  const m2 = order.milestones.sort((a, b) => a.seq - b.seq)[1];
  const inv = await createInvoiceFromMilestone(ctx, m2.id);
  const invRow = await prisma.invoice.findUnique({ where: { id: (inv as { invoiceId: string }).invoiceId } });
  console.log("3. Invoice:", invRow!.invoiceNo, "taxType:", invRow!.taxType, "total:", invRow!.total.toString());
  console.log("   GST breakup:", JSON.stringify(invRow!.gstBreakup), "words:", invRow!.amountWords);

  // 5. Receivables.
  const rec = await getReceivables(ctx);
  console.log("4. Receivables: outstanding", rec.totalOutstanding, "open milestones", rec.rows.length);

  await prisma.$disconnect();
  console.log("\n✅ Execute flow verified");
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});
