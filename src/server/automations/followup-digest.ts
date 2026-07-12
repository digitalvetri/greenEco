import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { dayRange, ymd, addDays, firstName } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A1 · Morning follow-up digest (08:00). One WhatsApp per employee listing their
 * follow-ups due today; one admin digest (due-today count, overdue >3d, going-cold).
 * Idempotent per user per day. (AUTOMATION-ENGINE-SPEC §3 A1)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start, end } = dayRange(ctx.now);
  const dateKey = ymd(ctx.now);

  const dueToday = await prisma.followUp.findMany({
    where: { nextDate: { gte: start, lt: end }, lead: { companyId: ctx.companyId, deletedAt: null } },
    include: { lead: { select: { customerName: true, phone: true, assignedToId: true } } },
    orderBy: { nextDate: "asc" },
  });

  // Group due-today follow-ups by the lead's owner.
  const byUser = new Map<string, typeof dueToday>();
  for (const f of dueToday) {
    const uid = f.lead?.assignedToId;
    if (!uid) continue;
    (byUser.get(uid) ?? byUser.set(uid, []).get(uid)!).push(f);
  }

  const users = await prisma.user.findMany({
    where: { companyId: ctx.companyId, id: { in: [...byUser.keys()] }, active: true },
    select: { id: true, name: true, phone: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    const list = byUser.get(u.id) ?? [];
    if (!list.length) continue;
    const lines = list
      .map((f, i) => `${i + 1}. ${f.lead?.customerName} — ${f.lead?.phone} — ${f.outcome ?? "follow up"}`)
      .join("\n");
    const body = `Good morning ${firstName(u.name)}! Today's follow-ups (${list.length}):\n${lines}\nOpen: ${env.appUrl}/leads`;
    const r = await deliver({
      name: "followup-digest",
      companyId: ctx.companyId,
      channel: "WHATSAPP",
      to: u.phone,
      body,
      dedupeKey: `A1:${u.id}:${dateKey}`,
      dryRun: ctx.dryRun,
      payload: { count: list.length },
    });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  // Admin digest: overdue >3 days + going-cold (open leads with no follow-up in 30d).
  const overdueCutoff = addDays(start, -3);
  const overdue = await prisma.followUp.count({
    where: {
      nextDate: { lt: overdueCutoff },
      lead: { companyId: ctx.companyId, deletedAt: null, status: { in: ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED"] } },
    },
  });
  const cold30 = addDays(start, -30);
  const goingCold = await prisma.lead.count({
    where: {
      companyId: ctx.companyId,
      deletedAt: null,
      status: { in: ["NEW", "IN_FOLLOWUP"] },
      followUps: { none: { createdAt: { gte: cold30 } } },
    },
  });

  const adminBody =
    `☀️ Follow-up digest ${dateKey}\n` +
    `Due today: ${dueToday.length} across ${users.length} staff\n` +
    `Overdue >3 days: ${overdue}\n` +
    `Going cold (30d silent): ${goingCold}\n${env.appUrl}/leads`;

  for (const phone of await adminPhones(ctx.companyId)) {
    const r = await deliver({
      name: "followup-digest",
      companyId: ctx.companyId,
      channel: "WHATSAPP",
      to: phone,
      body: adminBody,
      dedupeKey: `A1:admin:${phone}:${dateKey}`,
      dryRun: ctx.dryRun,
      payload: { dueToday: dueToday.length, overdue, goingCold },
    });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  return {
    name: "followup-digest",
    sent,
    skipped,
    details: { employees: users.length, dueToday: dueToday.length, overdue, goingCold },
  };
}

export const followupDigest: Automation = {
  id: "A1",
  name: "followup-digest",
  label: "Morning follow-up digest",
  schedule: "08:00 daily",
  run,
};
