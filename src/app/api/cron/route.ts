import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendWhatsApp, sendWhatsAppText } from "@/lib/whatsapp";
import { transitionAmcStatuses } from "@/server/services/amc";
import { lowStockItems } from "@/server/services/materials";

/**
 * Cron jobs (spec §7 cross-cutting): daily follow-up digest, due-date alerts,
 * low-stock digest, 90-day audio purge. Invoke from Coolify cron / GitHub Action:
 *   curl -H "x-cron-key: $CRON_KEY" $APP_URL/api/cron?job=all
 * Returns a JSON digest (WhatsApp/n8n delivery wired in Phase 4).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const job = url.searchParams.get("job") ?? "all";
  const key = req.headers.get("x-cron-key");
  if (env.cronKey && key !== env.cronKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const result: Record<string, unknown> = {};

  if (job === "all" || job === "followups") {
    const today = await prisma.followUp.findMany({
      where: { nextDate: { gte: startToday, lt: endToday }, lead: { companyId: env.companyId } },
      include: { lead: { select: { customerName: true, phone: true, assignedToId: true } } },
    });
    const overdueCutoff = new Date(startToday);
    overdueCutoff.setDate(overdueCutoff.getDate() - 3);
    const overdue = await prisma.followUp.count({
      where: { nextDate: { lt: overdueCutoff }, lead: { companyId: env.companyId, status: { in: ["NEW", "IN_FOLLOWUP", "QUOTE_REQUESTED"] } } },
    });
    result.followUpsToday = today.map((f) => ({ customer: f.lead?.customerName, phone: f.lead?.phone }));
    result.overdue = overdue;
  }

  if (job === "all" || job === "dueDates") {
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
  }

  if (job === "all" || job === "whatsapp") {
    // Best-effort WhatsApp payment reminders (via n8n) for milestones due today,
    // plus an admin digest. No-op when WHATSAPP_WEBHOOK_URL is unset.
    const dueToday = (result["due_in_0d"] as Array<{ order: string; client: string; amount: string }>) ?? [];
    let notified = 0;
    for (const d of dueToday) {
      const r = await sendWhatsApp({
        kind: "PAYMENT_REMINDER",
        to: "",
        orderNo: d.order,
        client: d.client,
        amount: d.amount,
        dueDate: startToday.toISOString(),
      });
      if (r.sent) notified++;
    }
    const digest = await sendWhatsApp({ kind: "ADMIN_DIGEST", summary: result });
    result.whatsapp = { paymentRemindersSent: notified, digestSent: digest.sent, reason: digest.reason };
  }

  if (job === "all" || job === "amc") {
    // Persist the lifecycle transitions the read layer only derived before:
    // ACTIVE→EXPIRED (past endDate), UPCOMING→DUE/MISSED. Makes the state machine real.
    const transitioned = await transitionAmcStatuses(env.companyId, now);

    const weekAhead = new Date(startToday);
    weekAhead.setDate(weekAhead.getDate() + 7);
    const expiryCutoff = new Date(startToday);
    expiryCutoff.setDate(expiryCutoff.getDate() + 30);
    const contactSelect = { proposal: { select: { lead: { select: { phone: true } } } } } as const;
    const [visitsDue, expiring] = await Promise.all([
      prisma.maintenanceVisit.findMany({
        where: {
          contract: { companyId: env.companyId },
          status: { in: ["UPCOMING", "DUE"] },
          scheduledDate: { lte: weekAhead },
        },
        include: { contract: { select: { contractNo: true, clientName: true, order: { select: contactSelect } } } },
      }),
      prisma.serviceContract.findMany({
        where: { companyId: env.companyId, status: "ACTIVE", endDate: { gte: startToday, lte: expiryCutoff } },
        select: { contractNo: true, clientName: true, endDate: true, order: { select: contactSelect } },
      }),
    ]);

    // Best-effort AMC reminders. Gated: sendWhatsAppText is a no-op (transport "none")
    // until a WhatsApp token is configured. Client phone resolves contract → order →
    // proposal → lead; contracts without a project link skip. IDEMPOTENT-by-threshold:
    // the digest above uses windows, but sends fire only on EXACT day boundaries so the
    // daily cron pings each event once — visit on its due-day, expiry at 30/7/1 days out
    // (not every day inside the window). This mirrors the payment branch's due_in_0d.
    const daysUntil = (d: Date) => Math.ceil((d.getTime() - startToday.getTime()) / 86_400_000);
    let visitReminders = 0;
    for (const v of visitsDue) {
      if (v.scheduledDate >= endToday || v.scheduledDate < startToday) continue; // due TODAY only
      const phone = v.contract.order?.proposal?.lead?.phone;
      if (!phone) continue;
      const r = await sendWhatsAppText(phone, `Reminder: preventive-maintenance visit for AMC ${v.contract.contractNo} is scheduled on ${v.scheduledDate.toLocaleDateString("en-IN")}.`);
      if (r.sent) visitReminders++;
    }
    let expiryReminders = 0;
    for (const c of expiring) {
      if (![30, 7, 1].includes(daysUntil(c.endDate))) continue; // fire once per threshold
      const phone = c.order?.proposal?.lead?.phone;
      if (!phone) continue;
      const r = await sendWhatsAppText(phone, `Your AMC ${c.contractNo} expires on ${c.endDate.toLocaleDateString("en-IN")}. Contact us to renew and keep your plant covered.`);
      if (r.sent) expiryReminders++;
    }

    result.amc = {
      transitioned,
      visitsDueThisWeek: visitsDue.map((v) => ({ contract: v.contract.contractNo, client: v.contract.clientName, on: v.scheduledDate.toISOString() })),
      contractsExpiring30d: expiring.map((c) => ({ contract: c.contractNo, client: c.clientName, endDate: c.endDate.toISOString() })),
      remindersSent: { visits: visitReminders, expiries: expiryReminders },
    };
  }

  if (job === "all" || job === "lowstock") {
    // Low-stock digest (spec §7.4) — wires the previously-dead lowStockItems into
    // the daily run. Gated admin WhatsApp digest (no-op until a token is set).
    const low = await lowStockItems({ userId: "cron", role: "ADMIN", companyId: env.companyId });
    let digestSent = false;
    if (low.length) {
      const summary = low.map((l) => `${l.item}: ${l.balance}/${l.reorderLevel}`).join(", ");
      const r = await sendWhatsApp({ kind: "ADMIN_DIGEST", summary: { lowStock: summary } });
      digestSent = r.sent;
    }
    result.lowStock = { count: low.length, items: low, digestSent };
  }

  if (job === "all" || job === "purgeAudio") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 90);
    const purged = await prisma.followUp.updateMany({
      where: { audioUrl: { not: null }, createdAt: { lt: cutoff } },
      data: { audioUrl: null },
    });
    result.audioPurged = purged.count;
  }

  return NextResponse.json({ ok: true, job, ranAt: now.toISOString(), ...result });
}
