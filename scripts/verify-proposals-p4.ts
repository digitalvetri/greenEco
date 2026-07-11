/** Verifies Proposals P2-8: editable payment terms + validity persist AND seed order milestones on Win. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion, approveAndSend, markWon, getProposal } from "@/server/services/proposal";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const lead = await createLead(A, { customerName: "P2-8 Terms", address: "12 Rd, Chennai", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in lead) || !lead.lead) throw new Error("lead failed");
  const pid = (await convertToProposal(A, lead.lead.id)).proposalId;

  const customTerms = [
    { description: "Advance on order", percent: 50, trigger: "DATE" },
    { description: "On delivery", percent: 30, trigger: "STAGE_COMPLETION" },
    { description: "On commissioning", percent: 20, trigger: "STAGE_COMPLETION" },
  ];
  await saveVersion(A, pid, {
    boqItems: [{ category: "Civil", item: "Tank", unit: "cum", qty: 10, rate: 10000, amount: 100000, aiSuggested: false }],
    paymentTerms: customTerms,
    validityDays: 45,
  });

  const full = await getProposal(A, pid);
  const v = (full as { versions: Array<{ versionNo: number; paymentTerms: unknown; validityDays: number }> }).versions[0];
  check("paymentTerms persisted (3 milestones)", Array.isArray(v.paymentTerms) && (v.paymentTerms as unknown[]).length === 3);
  check("validityDays persisted (45)", v.validityDays === 45);

  // approve → won → order milestones should derive from the terms
  await approveAndSend(A, pid);
  const wonRes = await markWon(A, pid);
  const order = await prisma.order.findFirst({ where: { id: wonRes.orderId ?? undefined }, include: { milestones: true } })
    ?? await prisma.order.findFirst({ where: { companyId: A.companyId }, orderBy: { createdAt: "desc" }, include: { milestones: true } });
  check("Won created an order", !!order);
  check("order has 3 milestones from the payment terms", order!.milestones.length === 3);
  const grand = 100000 * 1.18; // subtotal + 18% GST
  const sum = order!.milestones.reduce((a, m) => a + Number(m.amount), 0);
  check("milestone amounts sum to the grand total", Math.abs(sum - grand) < 1);

  console.log(`\n✅ Proposals P2-8 (payment terms → milestones) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
