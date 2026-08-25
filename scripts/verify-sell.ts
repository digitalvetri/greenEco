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

  // A proposal being drafted is office-only — an EMPLOYEE gets null, not a stripped
  // object. (This check used to run here against the draft; the field-stripping half
  // of it moved below, to after the proposal is confirmed and they can see it.)
  const draftForEmp = await getProposal(empCtx, conv.proposalId);
  console.log("4a. EMPLOYEE can see the DRAFT?", draftForEmp !== null, "(expected false)");
  if (draftForEmp !== null) throw new Error("FAIL: employee could read an unconfirmed proposal");

  // Set estimatedCost (admin) below grandTotal so margin passes.
  const cost = Math.round(Number(v.grandTotal) * 0.7);
  await saveVersion(ctx, conv.proposalId, { estimatedCost: cost });

  const approve = await approveAndSend(ctx, conv.proposalId);
  console.log("5. Approve:", JSON.stringify(approve));

  // Now that it's confirmed the EMPLOYEE can open it — and STILL must not see
  // estimatedCost. This is the stronger form of the original assertion: it now runs
  // against a proposal that actually HAS an estimatedCost stored on it.
  const pEmp = await getProposal(empCtx, conv.proposalId);
  if (!pEmp) throw new Error("FAIL: employee cannot see a confirmed proposal");
  const vEmp = pEmp.versions.find((x) => x.versionNo === pEmp.currentVersion)!;
  const empJson = JSON.stringify(vEmp);
  console.log("4b. EMPLOYEE sees estimatedCost?", empJson.includes("estimatedCost"), "(expected false)");
  if (empJson.includes("estimatedCost")) throw new Error("FAIL: estimatedCost leaked to EMPLOYEE");

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
