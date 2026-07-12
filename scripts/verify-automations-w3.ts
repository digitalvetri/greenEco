/**
 * Verifies Wave 3 A9 (delay detection) + A8 (budget sweep). A9: an overdue stage with a
 * team engineer yields a STAGE_DELAY task that auto-closes when a delay reason is recorded.
 * A8: the nightly sweep runs over active projects. Creates a throwaway stage; cleans up.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { updateStage } from "@/server/services/order";
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

  const order = await prisma.order.findFirst({ where: { companyId: A.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!order) throw new Error("need an ACTIVE order");

  // Ensure the order has a team engineer (A9 nudges the engineer).
  let createdTeam = false;
  const existingTeam = await prisma.teamAssignment.findFirst({ where: { orderId: order.id } });
  if (!existingTeam) {
    await prisma.teamAssignment.create({ data: { orderId: order.id, userId: admin.id, role: "SUPERVISOR" } });
    createdTeam = true;
  }

  const stage = await prisma.stage.create({
    data: { orderId: order.id, seq: 999, name: "A9 Verify Stage", status: "PENDING", plannedDate: addDays(new Date(), -3) },
  });

  try {
    await runAutomation("delay-detection", { companyId: A.companyId, now: new Date(), dryRun: false });
    const task = await prisma.automationTask.findFirst({ where: { companyId: A.companyId, type: "STAGE_DELAY", entityId: stage.id, status: "OPEN" } });
    check("A9 creates a STAGE_DELAY task for the overdue stage", !!task);

    // Second run doesn't duplicate the task.
    await runAutomation("delay-detection", { companyId: A.companyId, now: new Date(), dryRun: false });
    const openCount = await prisma.automationTask.count({ where: { companyId: A.companyId, type: "STAGE_DELAY", entityId: stage.id, status: "OPEN" } });
    check("A9 does not duplicate the task", openCount === 1);

    // Recording a delay reason auto-closes the task.
    await updateStage(A, stage.id, { delayReason: "Rain delay", plannedDate: addDays(new Date(), 5) });
    const afterClose = await prisma.automationTask.count({ where: { companyId: A.companyId, type: "STAGE_DELAY", entityId: stage.id, status: "OPEN" } });
    check("recording a delay reason auto-closes the task", afterClose === 0);

    // A8 sweep runs over active projects.
    const a8 = await runAutomation("budget-alerts", { companyId: A.companyId, now: new Date(), dryRun: true });
    check("A8 sweep covers active projects", ((a8.details as { swept?: number })?.swept ?? 0) > 0);
  } finally {
    await prisma.automationTask.deleteMany({ where: { entityId: stage.id, type: "STAGE_DELAY" } });
    await prisma.automationLog.deleteMany({ where: { name: "delay-detection", createdAt: { gte: addDays(new Date(), -1) } } });
    await prisma.stagePhoto.deleteMany({ where: { stageId: stage.id } });
    await prisma.auditLog.deleteMany({ where: { entity: "Stage", entityId: stage.id } });
    await prisma.stage.delete({ where: { id: stage.id } });
    if (createdTeam) await prisma.teamAssignment.deleteMany({ where: { orderId: order.id, userId: admin.id } });
  }

  console.log(`\n✅ Wave 3 (A9 + A8) verified — ${pass} checks passed`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
