import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Automation, AutomationContext, AutomationResult } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A14 · Win/loss learning loop (event-driven on Proposal → WON/LOST). Snapshots the decided
 * proposal into ProposalOutcome (written with the status change) so the AI generator can few-
 * shot on similar past winners and calibrate on band win-rate. (SPEC §7 A14)
 */
export async function recordProposalOutcome(db: Db, companyId: string, proposalId: string, outcome: "WON" | "LOST", reason: string | null): Promise<void> {
  const p = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1, select: { grandTotal: true, estimatedCost: true } } },
  });
  if (!p) return;
  const v = p.versions[0];
  const grand = v?.grandTotal ?? 0;
  const marginPct =
    v?.estimatedCost && Number(v.grandTotal) > 0 ? ((Number(v.grandTotal) - Number(v.estimatedCost)) / Number(v.grandTotal)) * 100 : null;
  const data = {
    companyId,
    outcome,
    reason,
    capacityKLD: p.capacityKLD,
    plantType: p.plantType,
    technology: p.technology,
    grandTotal: grand,
    marginPct,
    decidedAt: new Date(),
  };
  await db.proposalOutcome.upsert({
    where: { proposalId },
    create: { proposalId, ...data },
    update: { outcome, reason, decidedAt: new Date() },
  });
}

/** Up to 3 past WON proposals in the same plant type + ±30% KLD band — few-shot for the generator. */
export async function winningExamplesForBand(companyId: string, plantType: string, capacityKLD: number) {
  return prisma.proposalOutcome.findMany({
    where: { companyId, outcome: "WON", plantType, capacityKLD: { gte: capacityKLD * 0.7, lte: capacityKLD * 1.3 } },
    orderBy: { decidedAt: "desc" },
    take: 3,
    select: { capacityKLD: true, technology: true, grandTotal: true },
  });
}

/** Win-rate (0–1) for the plant type + ±30% KLD band. */
export async function bandWinRate(companyId: string, plantType: string, capacityKLD: number): Promise<{ won: number; total: number; rate: number }> {
  const band = { gte: capacityKLD * 0.7, lte: capacityKLD * 1.3 };
  const [won, total] = await Promise.all([
    prisma.proposalOutcome.count({ where: { companyId, plantType, outcome: "WON", capacityKLD: band } }),
    prisma.proposalOutcome.count({ where: { companyId, plantType, capacityKLD: band } }),
  ]);
  return { won, total, rate: total ? won / total : 0 };
}

/** Registry stub — event-driven; present for the kill switch + Settings row. */
async function run(_ctx: AutomationContext): Promise<AutomationResult> {
  const outcomes = await prisma.proposalOutcome.count({ where: { companyId: _ctx.companyId } });
  return { name: "winloss-learning", sent: 0, skipped: 0, details: { eventDriven: "runs on proposal WON/LOST", outcomesRecorded: outcomes } };
}

export const winlossLearning: Automation = {
  id: "A14",
  name: "winloss-learning",
  label: "Win/loss learning loop",
  run,
};
