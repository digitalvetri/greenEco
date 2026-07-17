/**
 * Verifies Phase 6 (streaming AI generation) against the live DB.
 * Run: npx tsx scripts/verify-phase6.ts (dev server must be running on :3000)
 */
import { prisma } from "@/lib/prisma";

async function main() {
  // 1. Persistence check: the DRAFT proposal we just streamed into should carry
  // the generated technicalText + aiGenerated flag on its current version.
  const proposal = await prisma.proposal.findFirst({
    where: { id: "cmrnz4z6n00048zs5sw7ju0ro" },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1, include: { boqItems: true } } },
  });
  if (!proposal) throw new Error("test proposal not found");
  const v = proposal.versions[0];
  console.log("aiGenerated:", v.aiGenerated);
  console.log("technicalText length:", v.technicalText?.length);
  console.log("boqItems count:", v.boqItems.length);

  // 2. Tenant boundary: a second company's admin must NOT be able to generate into
  // this proposal — the pre-check (getProposal) must 404 before any stream opens,
  // and generateForProposalStreaming's saveVersion must reject it if it were reached.
  const { randomUUID } = await import("crypto");
  const { getProposal, generateForProposalStreaming } = await import("@/server/services/proposal");
  const otherCompanyId = randomUUID();
  await prisma.company.create({ data: { id: otherCompanyId, name: "Verify Phase6 Foreign Co" } });
  try {
    const foreignCtx = { userId: "probe", role: "ADMIN" as const, companyId: otherCompanyId };

    const preCheck = await getProposal(foreignCtx, proposal.id);
    console.log("cross-tenant getProposal() result (must be null):", preCheck);

    try {
      await generateForProposalStreaming(foreignCtx, proposal.id, { description: "probe" }, () => {});
      console.log("FAIL: cross-tenant generateForProposalStreaming did not throw");
    } catch (e) {
      console.log("cross-tenant generateForProposalStreaming correctly rejected:", e instanceof Error ? e.message : e);
    }
  } finally {
    await prisma.company.delete({ where: { id: otherCompanyId } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
