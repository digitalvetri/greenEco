import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { draftInvoiceForMilestone } from "@/server/services/invoice";
import { deliver } from "./deliver";
import { adminPhones, isEnabled } from "./engine";
import type { Automation, AutomationContext, AutomationResult } from "./types";
import type { Ctx } from "@/lib/rbac";

/**
 * A5 · Stage completion → milestone DUE + draft invoice (event-driven, SPEC §4 A5).
 * Called from order.ts when a stage flips to DONE (recomputeMilestones already sets
 * STAGE_COMPLETION milestones to DUE). Auto-creates a DRAFT invoice per newly-due linked
 * milestone and notifies admin. Idempotent: one draft per milestone, dedupe on A5:{milestone}.
 */
export async function onStageCompleted(ctx: Ctx, stageId: string, dryRun = false): Promise<{ drafted: number; notified: number }> {
  if (!(await isEnabled(ctx.companyId, "A5"))) return { drafted: 0, notified: 0 };
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, order: { companyId: ctx.companyId } },
    include: { order: { select: { orderNo: true } } },
  });
  if (!stage) return { drafted: 0, notified: 0 };

  const milestones = await prisma.paymentMilestone.findMany({
    where: { linkedStageId: stageId, dueBasis: "STAGE_COMPLETION", order: { companyId: ctx.companyId } },
    include: { invoice: { select: { id: true } } },
  });
  const admins = await adminPhones(ctx.companyId);

  let drafted = 0;
  let notified = 0;
  for (const m of milestones) {
    if (m.status === "PAID") continue;
    if (!m.invoice) {
      if (!dryRun) {
        const r = await draftInvoiceForMilestone(ctx, m.id);
        if (r?.draft) drafted++;
      } else {
        drafted++;
      }
    }
    const body = `📄 Stage '${stage.name}' done on ${stage.order.orderNo}. Milestone '${m.description}' ${formatINR(m.amount.toString())} is now DUE — draft invoice ready: ${env.appUrl}/invoices`;
    for (const admin of admins) {
      const r = await deliver({
        name: "stage-milestone-trigger",
        companyId: ctx.companyId,
        channel: "WHATSAPP",
        to: admin,
        body,
        dedupeKey: `A5:${m.id}:${admin}`,
        dryRun,
        payload: { stage: stage.name, order: stage.order.orderNo },
      });
      if (r.sent) notified++;
    }
  }
  return { drafted, notified };
}

/** Registry stub — event-driven, so cron never runs it; present for the kill switch + Settings row. */
async function run(_ctx: AutomationContext): Promise<AutomationResult> {
  return { name: "stage-milestone-trigger", sent: 0, skipped: 0, details: { eventDriven: "fires when a linked stage completes" } };
}

export const stageMilestoneTrigger: Automation = {
  id: "A5",
  name: "stage-milestone-trigger",
  label: "Stage → milestone DUE + draft invoice",
  run,
};
