import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { waShareLink } from "@/lib/share-links";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { createAutomationTask, dayRange, addDays, yearWeek, BRAND_FOOTER } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A3 · Stale deal nudges (19:00). Proposals SENT/UNDER_NEGOTIATION with no proposal-
 * linked follow-up in 5 days → an AutomationTask + a WhatsApp to the owner containing a
 * drafted client check-in and a wa.me share link (never auto-sends to the client).
 * Proposals whose current version expires within 3 days → alert owner + admin.
 * Idempotent per proposal per week. (AUTOMATION-ENGINE-SPEC §3 A3)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start } = dayRange(ctx.now);
  const week = yearWeek(ctx.now);
  const staleCutoff = addDays(start, -5);

  const proposals = await prisma.proposal.findMany({
    where: { companyId: ctx.companyId, status: { in: ["SENT", "UNDER_NEGOTIATION"] } },
    include: {
      lead: { select: { customerName: true, phone: true, assignedToId: true } },
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { createdAt: true, validityDays: true, versionNo: true } },
      followUps: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  const ownerIds = [...new Set(proposals.map((p) => p.lead.assignedToId))];
  const owners = await prisma.user.findMany({
    where: { companyId: ctx.companyId, id: { in: ownerIds }, active: true },
    select: { id: true, name: true, phone: true },
  });
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const admins = await adminPhones(ctx.companyId);

  let sent = 0;
  let skipped = 0;
  let tasks = 0;

  for (const p of proposals) {
    const owner = ownerById.get(p.lead.assignedToId);
    const version = p.versions[0];

    // ── Stale: no proposal follow-up in 5 days ──────────────────────────────
    const lastTouch = p.followUps[0]?.createdAt ?? p.createdAt;
    if (lastTouch < staleCutoff) {
      const draft = `Hello ${p.lead.customerName}, following up on our proposal (${p.number}) for your ${p.plantType} plant. Happy to answer any questions or revise it for you. ${BRAND_FOOTER}`;
      const link = waShareLink(p.lead.phone, draft);

      if (!ctx.dryRun) {
        const existing = await prisma.automationTask.findFirst({
          where: { companyId: ctx.companyId, type: "STALE_PROPOSAL", entityId: p.id, status: "OPEN" },
        });
        if (!existing) {
          await createAutomationTask({
            companyId: ctx.companyId,
            type: "STALE_PROPOSAL",
            title: `Check in on ${p.number} — ${p.lead.customerName}`,
            entity: "Proposal",
            entityId: p.id,
            assigneeId: p.lead.assignedToId,
            dueDate: addDays(ctx.now, 1),
            href: `/proposals/${p.id}`,
          });
          tasks++;
        }
      } else {
        tasks++;
      }

      if (owner?.phone) {
        const days = Math.floor((start.getTime() - lastTouch.getTime()) / 86_400_000);
        const body = `⏳ ${p.number} for ${p.lead.customerName} (${p.plantType}) has been quiet ${days} days.\nTap to check in: ${link}\nOpen: ${env.appUrl}/proposals/${p.id}`;
        const r = await deliver({
          name: "stale-deal-nudge",
          companyId: ctx.companyId,
          channel: "WHATSAPP",
          to: owner.phone,
          body,
          dedupeKey: `A3:${p.id}:stale:${week}`,
          dryRun: ctx.dryRun,
          payload: { days },
        });
        if (r.sent) sent++;
        if (r.skipped) skipped++;
      }
    }

    // ── Expiring: current version validity ends within 3 days ───────────────
    if (version) {
      const expiry = addDays(version.createdAt, version.validityDays);
      if (expiry >= start && expiry <= addDays(start, 3)) {
        const body = `⚠️ Proposal ${p.number} for ${p.lead.customerName} expires ${expiry.toLocaleDateString("en-IN")} — revise or push to close. ${env.appUrl}/proposals/${p.id}`;
        for (const to of [owner?.phone, ...admins].filter((x): x is string => !!x)) {
          const r = await deliver({
            name: "stale-deal-nudge",
            companyId: ctx.companyId,
            channel: "WHATSAPP",
            to,
            body,
            dedupeKey: `A3:${p.id}:expiry:${week}:${to}`,
            dryRun: ctx.dryRun,
            payload: { expiry: expiry.toISOString() },
          });
          if (r.sent) sent++;
          if (r.skipped) skipped++;
        }
      }
    }
  }

  return { name: "stale-deal-nudge", sent, skipped, details: { proposals: proposals.length, tasksCreated: tasks } };
}

export const staleDealNudge: Automation = {
  id: "A3",
  name: "stale-deal-nudge",
  label: "Stale deal nudges",
  schedule: "19:00 daily",
  run,
};
