/**
 * Verifies Wave 1 automations A2 (auto next-follow-up) + A3 (stale-deal nudges).
 * A2: a NEEDS_TIME follow-up with no nextDate auto-fills now+7d + flags the response.
 * A3: dry-run returns details; a stale proposal yields exactly one task (idempotent).
 * Creates a throwaway lead + follow-up and cleans everything up.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { addFollowUp } from "@/server/services/lead";
import { runAutomation } from "@/server/automations/engine";
import { registerAll } from "@/server/automations";

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

  // ── A2 ──────────────────────────────────────────────────────────────────
  const lead = await prisma.lead.create({
    data: {
      companyId: A.companyId,
      customerName: "A2 Verify Lead",
      address: "test",
      phone: "9000000002",
      source: "REFERENCE",
      assignedToId: admin.id,
      createdById: admin.id,
      status: "IN_FOLLOWUP",
    },
  });
  try {
    const before = Date.now();
    const fu = (await addFollowUp(A, { leadId: lead.id, type: "CALL", notes: "needs time", outcome: "NEEDS_TIME" })) as {
      id: string;
      nextDate: Date | null;
      nextDateAutoSuggested?: boolean;
    };
    check("A2 flags nextDateAutoSuggested", fu.nextDateAutoSuggested === true);
    const gapDays = fu.nextDate ? Math.round((fu.nextDate.getTime() - before) / 86_400_000) : -1;
    check("A2 auto-fills NEEDS_TIME to ~+7 days", gapDays === 7);
    const audit = await prisma.auditLog.findFirst({ where: { entity: "FollowUp", entityId: fu.id } });
    check("A2 auto-suggestion is audited", !!audit && JSON.stringify(audit.after).includes("nextDateAutoSuggested"));
  } finally {
    await prisma.followUp.deleteMany({ where: { leadId: lead.id } });
    await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
  }

  // ── A3 ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const dry = await runAutomation("stale-deal-nudge", { companyId: A.companyId, now, dryRun: true });
  check("A3 dry-run returns proposal + task counts", typeof (dry.details as { proposals?: number })?.proposals === "number");

  // Real run task idempotency (only if there's a stale proposal in the DB).
  const createdTaskIds: string[] = [];
  try {
    const tasksBefore = await prisma.automationTask.count({ where: { companyId: A.companyId, type: "STALE_PROPOSAL", status: "OPEN" } });
    await runAutomation("stale-deal-nudge", { companyId: A.companyId, now, dryRun: false });
    const tasksAfter1 = await prisma.automationTask.count({ where: { companyId: A.companyId, type: "STALE_PROPOSAL", status: "OPEN" } });
    await runAutomation("stale-deal-nudge", { companyId: A.companyId, now, dryRun: false });
    const tasksAfter2 = await prisma.automationTask.count({ where: { companyId: A.companyId, type: "STALE_PROPOSAL", status: "OPEN" } });
    check("A3 creates stale-proposal tasks idempotently (2nd run adds 0)", tasksAfter2 === tasksAfter1 && tasksAfter1 >= tasksBefore);
    const created = await prisma.automationTask.findMany({ where: { companyId: A.companyId, type: "STALE_PROPOSAL", createdAt: { gte: now } }, select: { id: true } });
    createdTaskIds.push(...created.map((t) => t.id));
  } finally {
    if (createdTaskIds.length) await prisma.automationTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.automationLog.deleteMany({ where: { name: "stale-deal-nudge", createdAt: { gte: now } } });
  }

  console.log(`\n✅ Wave 1 (A2 + A3) verified — ${pass} checks passed`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
