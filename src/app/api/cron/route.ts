import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendWhatsApp, sendWhatsAppText } from "@/lib/whatsapp";
import { transitionAmcStatuses } from "@/server/services/amc";
import { lowStockItems } from "@/server/services/materials";
import { registerAll } from "@/server/automations";
import { getAutomation, runAutomation, scheduledNames } from "@/server/automations/engine";
import type { AutomationContext } from "@/server/automations/types";

/**
 * Automation Engine entrypoint (AUTOMATION-ENGINE-SPEC §1.2). Auth via x-cron-key.
 *   curl -H "x-cron-key: $CRON_KEY" "$APP_URL/api/cron?job=all"
 *   ?job=<name>[,<name>]  run specific automations (1:1 with the registry)
 *   ?job=all              every scheduled automation + the non-automation legacy jobs
 *   ?dryRun=1             compute + log DRY_RUN, send nothing (tests / staging)
 *
 * Registered automations run through the engine (kill switch + idempotency + logging).
 * `amc`/`purgeAudio` are lifecycle jobs, not automations, and stay inline. Legacy
 * dueDates/whatsapp/lowstock branches are removed as A4/A11 migrate them.
 */
registerAll();

// A4 replaced dueDates+whatsapp; A11 replaced lowstock. amc/purgeAudio stay inline.
const LEGACY_ALL = ["amc", "purgeAudio"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobParam = url.searchParams.get("job") ?? "all";
  const dryRun = url.searchParams.get("dryRun") === "1";
  const key = req.headers.get("x-cron-key");
  const { loadConfig } = await import("@/lib/runtime-config");
  const cronKey = (await loadConfig(env.companyId)).CRON_KEY;
  // Fail CLOSED: in production an unset CRON_KEY must not leave the endpoint world-triggerable.
  // (Previously the guard was skipped entirely when cronKey was empty → anyone could run every
  // automation.) With no key configured in prod, refuse all calls; the operator must set CRON_KEY
  // to use cron at all. In dev (unset key) it stays open for convenience.
  if (!cronKey) {
    if (env.isProduction) {
      return NextResponse.json({ error: "cron disabled: CRON_KEY not configured" }, { status: 401 });
    }
  } else if (key !== cronKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);

  const ctx: AutomationContext = { companyId: env.companyId, now, dryRun };
  const result: Record<string, unknown> = {};

  const requested = jobParam === "all" ? [...scheduledNames(), ...LEGACY_ALL] : jobParam.split(",").map((s) => s.trim());

  for (const name of requested) {
    // Registered automation → run through the engine.
    if (getAutomation(name)) {
      result[name] = await runAutomation(name, ctx);
      continue;
    }

    // ── Legacy inline jobs (migrated away wave by wave) ──────────────────────
    if (name === "dueDates") {
      for (const days of [7, 3, 0]) {
        const target = new Date(startToday);
        target.setDate(target.getDate() + days);
        const end = new Date(target);
        end.setDate(end.getDate() + 1);
        const due = await prisma.paymentMilestone.findMany({
          where: { dueDate: { gte: target, lt: end }, status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID"] }, order: { companyId: env.companyId } },
          include: { order: { select: { orderNo: true, clientName: true } } },
        });
        result[`due_in_${days}d`] = due.map((m) => ({ order: m.order.orderNo, client: m.order.clientName, amount: m.amount.toString() }));
      }
    } else if (name === "whatsapp") {
      const dueToday = (result["due_in_0d"] as Array<{ order: string; client: string; amount: string }>) ?? [];
      let notified = 0;
      // Respect dryRun: a dry run must NOT actually send WhatsApp (the legacy inline jobs used to
      // send regardless, so ?dryRun=1 was not safe to run against a live WhatsApp config).
      if (!dryRun) {
        for (const d of dueToday) {
          const r = await sendWhatsApp({ kind: "PAYMENT_REMINDER", to: "", orderNo: d.order, client: d.client, amount: d.amount, dueDate: startToday.toISOString() });
          if (r.sent) notified++;
        }
      }
      const digest = dryRun ? { sent: false, reason: "dry-run" as const } : await sendWhatsApp({ kind: "ADMIN_DIGEST", summary: result });
      result.whatsapp = { dryRun, paymentRemindersSent: notified, digestSent: digest.sent, reason: digest.reason };
    } else if (name === "amc") {
      const transitioned = await transitionAmcStatuses(env.companyId, now);
      const weekAhead = new Date(startToday);
      weekAhead.setDate(weekAhead.getDate() + 7);
      const expiryCutoff = new Date(startToday);
      expiryCutoff.setDate(expiryCutoff.getDate() + 30);
      const contactSelect = { proposal: { select: { lead: { select: { phone: true } } } } } as const;
      const [visitsDue, expiring] = await Promise.all([
        prisma.maintenanceVisit.findMany({
          where: { contract: { companyId: env.companyId }, status: { in: ["UPCOMING", "DUE"] }, scheduledDate: { lte: weekAhead } },
          include: { contract: { select: { contractNo: true, clientName: true, order: { select: contactSelect } } } },
        }),
        prisma.serviceContract.findMany({
          where: { companyId: env.companyId, status: "ACTIVE", endDate: { gte: startToday, lte: expiryCutoff } },
          select: { contractNo: true, clientName: true, endDate: true, order: { select: contactSelect } },
        }),
      ]);
      const daysUntil = (d: Date) => Math.ceil((d.getTime() - startToday.getTime()) / 86_400_000);
      let visitReminders = 0;
      for (const v of visitsDue) {
        if (v.scheduledDate >= endToday || v.scheduledDate < startToday) continue;
        const phone = v.contract.order?.proposal?.lead?.phone;
        if (!phone || dryRun) continue; // dryRun: never actually send
        const r = await sendWhatsAppText(phone, `Reminder: preventive-maintenance visit for AMC ${v.contract.contractNo} is scheduled on ${v.scheduledDate.toLocaleDateString("en-IN")}.`);
        if (r.sent) visitReminders++;
      }
      let expiryReminders = 0;
      for (const c of expiring) {
        if (![30, 7, 1].includes(daysUntil(c.endDate))) continue;
        const phone = c.order?.proposal?.lead?.phone;
        if (!phone || dryRun) continue; // dryRun: never actually send
        const r = await sendWhatsAppText(phone, `Your AMC ${c.contractNo} expires on ${c.endDate.toLocaleDateString("en-IN")}. Contact us to renew and keep your plant covered.`);
        if (r.sent) expiryReminders++;
      }
      result.amc = {
        transitioned,
        visitsDueThisWeek: visitsDue.map((v) => ({ contract: v.contract.contractNo, client: v.contract.clientName, on: v.scheduledDate.toISOString() })),
        contractsExpiring30d: expiring.map((c) => ({ contract: c.contractNo, client: c.clientName, endDate: c.endDate.toISOString() })),
        remindersSent: { visits: visitReminders, expiries: expiryReminders },
      };
    } else if (name === "lowstock") {
      const low = await lowStockItems({ userId: "cron", role: "ADMIN", companyId: env.companyId });
      let digestSent = false;
      if (low.length && !dryRun) {
        const summary = low.map((l) => `${l.item}: ${l.balance}/${l.reorderLevel}`).join(", ");
        const r = await sendWhatsApp({ kind: "ADMIN_DIGEST", summary: { lowStock: summary } });
        digestSent = r.sent;
      }
      result.lowStock = { dryRun, count: low.length, items: low, digestSent };
    } else if (name === "purgeAudio") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 90);
      if (dryRun) {
        const wouldPurge = await prisma.followUp.count({ where: { audioUrl: { not: null }, createdAt: { lt: cutoff } } });
        result.audioPurged = { dryRun: true, wouldPurge };
      } else {
        const purged = await prisma.followUp.updateMany({ where: { audioUrl: { not: null }, createdAt: { lt: cutoff } }, data: { audioUrl: null } });
        result.audioPurged = purged.count;
      }
    } else {
      result[name] = { error: "unknown job" };
    }
  }

  return NextResponse.json({ ok: true, job: jobParam, dryRun, ranAt: now.toISOString(), ...result });
}
