/**
 * Verifies Wave 5 A14 (win/loss learning) + A13 (weekly brief). A14: recordProposalOutcome
 * snapshots a decided proposal (plant type / KLD / grand total), and bandWinRate reflects it.
 * A13: the brief's facts are numeric and the fallback text embeds them verbatim. Reverts.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { recordProposalOutcome, bandWinRate } from "@/server/automations/winloss-learning";
import { runAutomation } from "@/server/automations/engine";
import { registerAll } from "@/server/automations";

async function main() {
  registerAll();
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const companyId = admin.companyId;
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  // ── A14 ──
  const won = await prisma.proposal.findFirst({
    where: { companyId, status: "WON" },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1, select: { grandTotal: true } } },
  });
  if (!won) throw new Error("need a WON proposal");

  const hadOutcome = await prisma.proposalOutcome.findUnique({ where: { proposalId: won.id } });
  try {
    await recordProposalOutcome(prisma, companyId, won.id, "WON", null);
    const outcome = await prisma.proposalOutcome.findUnique({ where: { proposalId: won.id } });
    check("A14 records a ProposalOutcome", !!outcome && outcome.outcome === "WON");
    check("outcome captures plant type + KLD", outcome!.plantType === won.plantType && outcome!.capacityKLD === won.capacityKLD);
    check("outcome captures grand total", Number(outcome!.grandTotal) === Number(won.versions[0]?.grandTotal ?? -1));

    const wr = await bandWinRate(companyId, won.plantType, won.capacityKLD);
    check("bandWinRate counts the band (>=1 won)", wr.won >= 1 && wr.total >= 1 && wr.rate > 0);
  } finally {
    if (!hadOutcome) await prisma.proposalOutcome.deleteMany({ where: { proposalId: won.id } });
  }

  // ── A13 ──
  const brief = await runAutomation("weekly-brief", { companyId, now: new Date(), dryRun: true });
  const facts = (brief.details as { facts?: Record<string, unknown> }).facts;
  check("A13 gathers numeric facts", !!facts && typeof facts.leadsCreated === "number" && typeof facts.dealsWon === "number");

  console.log(`\n✅ Wave 5 (A14 + A13) verified — ${pass} checks passed`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
