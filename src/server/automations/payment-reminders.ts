import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";
import { deliver } from "./deliver";
import { getSetting, adminPhones } from "./engine";
import { dayRange, addDays, istHour, BRAND_FOOTER } from "./util";
import type { Automation, AutomationContext, AutomationResult } from "./types";

/**
 * A4 · Client payment reminders (08:00; delivered 09:00–19:00 IST). Milestones due at
 * +7/+3/0/−3/−7 days → WhatsApp the client: gentle (upcoming), standard + payment details
 * (today), firm + invoice no + CC admin (overdue). Balance nets receipts; skip if ≤ 0.
 * Idempotent per milestone per offset; sends only inside the quiet-hours window (else
 * deferred — the dedupeKey is only burned on an actual in-window send). (SPEC §4 A4)
 */
const OFFSETS = [7, 3, 0, -3, -7];

async function run(ctx: AutomationContext): Promise<AutomationResult> {
  const { start } = dayRange(ctx.now);
  const hour = istHour(ctx.now);
  const inWindow = ctx.dryRun || (hour >= 9 && hour < 19);
  const paymentDetails = await getSetting<string>(ctx.companyId, "A4.paymentDetails", "");
  const admins = await adminPhones(ctx.companyId);

  let sent = 0;
  let skipped = 0;
  let chased = new Decimal(0);

  for (const offset of OFFSETS) {
    const target = addDays(start, offset);
    const end = addDays(target, 1);
    const milestones = await prisma.paymentMilestone.findMany({
      where: {
        dueDate: { gte: target, lt: end },
        status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID"] },
        order: { companyId: ctx.companyId, deletedAt: null },
      },
      include: {
        order: { select: { orderNo: true, clientName: true, clientPhone: true } },
        receipts: { select: { amount: true } },
        invoice: { select: { invoiceNo: true } },
      },
    });

    for (const m of milestones) {
      const paid = m.receipts.reduce((a, r) => a.plus(new Decimal(r.amount)), new Decimal(0));
      const balance = new Decimal(m.amount).minus(paid);
      if (balance.lte(0)) continue;
      const phone = m.order.clientPhone;
      if (!phone) {
        skipped++;
        continue;
      }
      const amt = formatINR(balance.toFixed(2));
      const dueStr = target.toLocaleDateString("en-IN");
      let body: string;
      if (offset > 0) {
        body = `Friendly reminder: milestone '${m.description}' of ${amt} for ${m.order.orderNo} is due on ${dueStr}. Kindly arrange payment. ${BRAND_FOOTER}`;
      } else if (offset === 0) {
        body = `Reminder: milestone '${m.description}' of ${amt} for ${m.order.orderNo} is due today (${dueStr}). Kindly arrange payment.${paymentDetails ? `\n${paymentDetails}` : ""}\n${BRAND_FOOTER}`;
      } else {
        const inv = m.invoice?.invoiceNo ? ` (invoice ${m.invoice.invoiceNo})` : "";
        body = `Overdue: milestone '${m.description}' of ${amt} for ${m.order.orderNo}${inv} was due on ${dueStr}. Kindly treat this as priority. ${BRAND_FOOTER}`;
      }

      if (!inWindow) {
        skipped++;
        continue; // deferred to the next in-window run — dedupeKey not burned
      }

      const r = await deliver({
        name: "payment-reminders",
        companyId: ctx.companyId,
        channel: "WHATSAPP",
        to: phone,
        body,
        dedupeKey: `A4:${m.id}:${offset}`,
        dryRun: ctx.dryRun,
        payload: { offset, balance: balance.toFixed(2), order: m.order.orderNo },
      });
      if (r.sent) {
        sent++;
        chased = chased.plus(balance);
      }
      if (r.skipped) skipped++;

      // Overdue → CC admin.
      if (offset < 0) {
        for (const admin of admins) {
          const ar = await deliver({
            name: "payment-reminders",
            companyId: ctx.companyId,
            channel: "WHATSAPP",
            to: admin,
            body: `⚠️ Overdue: ${m.order.clientName} — '${m.description}' ${amt} for ${m.order.orderNo}, due ${dueStr}.`,
            dedupeKey: `A4:${m.id}:${offset}:admin:${admin}`,
            dryRun: ctx.dryRun,
          });
          if (ar.sent) sent++;
          if (ar.skipped) skipped++;
        }
      }
    }
  }

  // Admin summary (once per day, in-window).
  if (inWindow && chased.gt(0)) {
    for (const admin of admins) {
      await deliver({
        name: "payment-reminders",
        companyId: ctx.companyId,
        channel: "WHATSAPP",
        to: admin,
        body: `💰 Payment reminders: ${sent} sent, ${formatINR(chased.toFixed(2))} chased today.`,
        dedupeKey: `A4:summary:${admin}:${start.toISOString().slice(0, 10)}`,
        dryRun: ctx.dryRun,
      });
    }
  }

  return { name: "payment-reminders", sent, skipped, details: { chased: chased.toFixed(2), inWindow, istHour: hour } };
}

export const paymentReminders: Automation = {
  id: "A4",
  name: "payment-reminders",
  label: "Client payment reminders",
  schedule: "08:00 daily (sent 09:00–19:00 IST)",
  run,
};
