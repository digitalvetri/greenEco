import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";
import { llmText } from "@/lib/llm";
import { lowStockItems } from "@/server/services/materials";
import { deliver } from "./deliver";
import { adminPhones } from "./engine";
import { dayRange, addDays, ymd } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A13 · AI weekly business brief (Mon 08:30) via Groq. Facts are gathered server-side
 * (the LLM never queries) then summarised into a WhatsApp-friendly brief (Pipeline / Money
 * / Risks / Top-3 actions). Groq failure → a numeric fallback brief, never a silent skip.
 * (SPEC §7 A13)
 */
async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start } = dayRange(ctx.now);
  const weekAgo = addDays(start, -7);
  const sysCtx = { userId: "system:automation", role: "ADMIN" as const, companyId: ctx.companyId };

  const [leadsCreated, proposalsCreated, wonOrders, receipts, pendingVerifications, low, delayedStages] = await Promise.all([
    prisma.lead.count({ where: { companyId: ctx.companyId, createdAt: { gte: weekAgo }, deletedAt: null } }),
    prisma.proposal.count({ where: { companyId: ctx.companyId, createdAt: { gte: weekAgo } } }),
    prisma.order.findMany({ where: { companyId: ctx.companyId, createdAt: { gte: weekAgo }, deletedAt: null }, select: { projectValue: true } }),
    prisma.receipt.aggregate({ where: { date: { gte: weekAgo }, milestone: { order: { companyId: ctx.companyId } } }, _sum: { amount: true } }),
    prisma.erectionEntry.count({ where: { order: { companyId: ctx.companyId }, status: { in: ["PENDING", "QUERIED"] } } }),
    lowStockItems(sysCtx),
    prisma.stage.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] }, plannedDate: { lt: start }, delayReason: null, order: { companyId: ctx.companyId, status: "ACTIVE", deletedAt: null } } }),
  ]);

  const wonValue = wonOrders.reduce((a, o) => a.plus(new Decimal(o.projectValue ?? 0)), new Decimal(0));
  const collected = new Decimal(receipts._sum.amount ?? 0);
  const facts = {
    week: `${ymd(weekAgo)} → ${ymd(start)}`,
    leadsCreated,
    proposalsCreated,
    dealsWon: wonOrders.length,
    wonValue: wonValue.toFixed(0),
    collected: collected.toFixed(0),
    pendingVerifications,
    lowStock: low.length,
    delayedStages,
  };

  const fallback =
    `📈 Weekly brief (${facts.week})\n` +
    `Pipeline: ${leadsCreated} new leads, ${proposalsCreated} proposals, ${facts.dealsWon} won (${formatINR(facts.wonValue)})\n` +
    `Money: ${formatINR(facts.collected)} collected\n` +
    `Risks: ${delayedStages} delayed stages, ${pendingVerifications} pending verifications, ${low.length} low-stock items\n` +
    `Actions: chase overdue payments · clear the verification queue · reorder low stock`;

  let brief = fallback;
  // Any configured text provider (Groq / Gemini / Claude) — falls back to the numeric brief.
  const ai = await llmText(
    "You are the operations analyst for Green Ecocare, a wastewater-treatment company. Write plain text only, Indian ₹ format, no markdown.",
    `Given these JSON facts, write a WhatsApp-friendly brief under 900 characters with exactly 4 short sections: 1) Pipeline 2) Money 3) Risks 4) Top 3 actions for this week. Use the numbers exactly as given.\n\n${JSON.stringify(facts)}`,
    { maxTokens: 400, temperature: 0.3 },
  );
  const aiText = ai?.text;
  if (aiText && aiText.length <= 1200) brief = aiText;

  let sent = 0;
  let skipped = 0;
  for (const admin of await adminPhones(ctx.companyId)) {
    const r = await deliver({ name: "weekly-brief", companyId: ctx.companyId, channel: "WHATSAPP", to: admin, body: brief, dedupeKey: `A13:${ymd(start)}:${admin}`, dryRun: ctx.dryRun, payload: { facts, aiUsed: !!aiText, aiProvider: ai?.provider } });
    if (r.sent) sent++;
    if (r.skipped) skipped++;
  }

  return { name: "weekly-brief", sent, skipped, details: { facts, aiUsed: !!aiText, aiProvider: ai?.provider ?? null } };
}

export const weeklyBrief: Automation = {
  id: "A13",
  name: "weekly-brief",
  label: "AI weekly business brief",
  schedule: "Mon 08:30",
  run,
};
