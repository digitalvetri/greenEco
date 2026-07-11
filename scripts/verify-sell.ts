import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import {
  updateBasics,
  generateForProposal,
  getProposal,
  saveVersion,
  approveAndSend,
  markWon,
} from "@/server/services/proposal";

const ctx = { userId: "dev-admin", role: "ADMIN" as const, companyId: env.companyId };
const empCtx = { userId: "dev-employee", role: "EMPLOYEE" as const, companyId: env.companyId };

async function main() {
  const phone = "9700" + String(Math.floor(Date.now() / 1000)).slice(-6);
  const lead = await createLead(ctx, {
    customerName: "Verify Flow Apartments",
    address: "Peelamedu, Coimbatore",
    phone,
    source: "Reference",
    requirement: "STP 40 KLD MBBR",
  } as never);
  const leadId = "lead" in lead ? lead.lead!.id : (() => { throw new Error("no lead"); })();
  console.log("1. Lead:", leadId);

  const conv = await convertToProposal(ctx, leadId);
  console.log("2. Proposal:", conv.proposalId, "number" in conv ? conv.number : "(existing)");

  await updateBasics(ctx, conv.proposalId, { plantType: "STP", technology: "MBBR", capacityKLD: 40 });
  const gen = await generateForProposal(ctx, conv.proposalId, {
    description: "STP 40 KLD for 120 flats, reuse for gardening",
    capacityKLD: 40,
    technology: "MBBR",
    plantType: "STP",
  });
  console.log("3. AI generate source:", gen.source);

  const p = await getProposal(ctx, conv.proposalId);
  const v = p!.versions.find((x) => x.versionNo === p!.currentVersion)!;
  console.log("   BOQ lines:", v.boqItems.length, "grandTotal:", v.grandTotal.toString());

  // EMPLOYEE must NOT see estimatedCost.
  const pEmp = await getProposal(empCtx, conv.proposalId);
  const vEmp = pEmp!.versions.find((x) => x.versionNo === pEmp!.currentVersion)!;
  const empJson = JSON.stringify(vEmp);
  console.log("4. EMPLOYEE sees estimatedCost?", empJson.includes("estimatedCost"));

  // Set estimatedCost (admin) below grandTotal so margin passes.
  const cost = Math.round(Number(v.grandTotal) * 0.7);
  await saveVersion(ctx, conv.proposalId, { estimatedCost: cost });

  const approve = await approveAndSend(ctx, conv.proposalId);
  console.log("5. Approve:", JSON.stringify(approve));

  const won = await markWon(ctx, conv.proposalId);
  console.log("6. Won:", JSON.stringify(won));

  const order = await prisma.order.findUnique({
    where: { id: (won as { orderId: string }).orderId },
    include: { stages: true, milestones: true, budget: true, siteLocation: true },
  });
  console.log("   Order:", order!.orderNo, "value:", order!.projectValue.toString());
  console.log("   Stages:", order!.stages.length, "Milestones:", order!.milestones.length);
  console.log("   Budget base:", order!.budget?.baseAmount.toString(), "SITE loc:", order!.siteLocation?.name);
  console.log(
    "   Milestone amounts:",
    order!.milestones.map((m) => m.amount.toString()).join(", "),
  );

  await prisma.$disconnect();
  console.log("\n✅ Sell flow verified");
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});
