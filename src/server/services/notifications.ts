import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";

export interface Notification {
  kind: "followup" | "verification" | "ticket" | "overdue" | "visit" | "lowstock";
  label: string;
  detail: string;
  href: string;
  tone: "primary" | "warn" | "danger";
}

/** Real, live notifications for the header bell (RBAC-aware). */
export async function getNotifications(ctx: Ctx): Promise<Notification[]> {
  const isAdmin = ctx.role === "ADMIN";
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);

  const out: Notification[] = [];

  const [followUps, visits, tickets, verifications, overdue] = await Promise.all([
    prisma.followUp.count({
      where: {
        nextDate: { gte: startToday, lt: endToday },
        lead: { companyId: ctx.companyId, ...(isAdmin ? {} : { assignedToId: ctx.userId }) },
      },
    }),
    prisma.maintenanceVisit.count({
      where: { contract: { companyId: ctx.companyId }, status: "DUE" },
    }),
    prisma.serviceTicket.count({
      where: { companyId: ctx.companyId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "CRITICAL"] } },
    }),
    isAdmin
      ? prisma.erectionEntry.count({ where: { order: { companyId: ctx.companyId }, status: "PENDING" } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.paymentMilestone.count({
          where: { order: { companyId: ctx.companyId }, status: { in: ["DUE", "PARTIALLY_PAID"] }, dueDate: { lt: now } },
        })
      : Promise.resolve(0),
  ]);

  if (followUps > 0)
    out.push({ kind: "followup", label: `${followUps} follow-up${followUps > 1 ? "s" : ""} due today`, detail: "Leads awaiting contact", href: "/leads", tone: "primary" });
  if (verifications > 0)
    out.push({ kind: "verification", label: `${verifications} erection entr${verifications > 1 ? "ies" : "y"} to verify`, detail: "Pending your approval", href: "/erection", tone: "warn" });
  if (tickets > 0)
    out.push({ kind: "ticket", label: `${tickets} high-priority ticket${tickets > 1 ? "s" : ""}`, detail: "Open service requests", href: "/service", tone: "danger" });
  if (visits > 0)
    out.push({ kind: "visit", label: `${visits} maintenance visit${visits > 1 ? "s" : ""} due`, detail: "AMC preventive maintenance", href: "/service", tone: "warn" });
  if (overdue > 0)
    out.push({ kind: "overdue", label: `${overdue} overdue payment${overdue > 1 ? "s" : ""}`, detail: "Receivables past due", href: "/reports", tone: "danger" });

  return out;
}
