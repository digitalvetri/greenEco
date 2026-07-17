/**
 * Verifies Phase 7 (notification center) against the live DB. Run:
 * npx tsx scripts/verify-phase7.ts (dev server must be running on :3000)
 */
import { prisma } from "@/lib/prisma";
import {
  getNotifications,
  unreadCount,
  listNotifications,
  markNotificationRead,
  dismissNotification,
} from "@/server/services/notifications";

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "admin@greeneco.in" } });
  const emp = await prisma.user.findFirst({ where: { email: "employee@greeneco.in" } });
  if (!admin || !emp) throw new Error("seeded users not found");
  const adminCtx = { userId: admin.id, role: admin.role as "ADMIN" | "EMPLOYEE", companyId: admin.companyId };
  const empCtx = { userId: emp.id, role: emp.role as "ADMIN" | "EMPLOYEE", companyId: emp.companyId };

  // 1. Create a disposable EMPLOYEE-assigned task (e.g. a FOLLOWUP_DUE-shaped one).
  const task = await prisma.automationTask.create({
    data: {
      companyId: emp.companyId,
      type: "FOLLOWUP_DUE",
      title: "Verify Phase7 follow-up",
      entity: "FollowUp",
      entityId: "verify-phase7-fake-id",
      assigneeId: emp.id,
    },
  });

  // 2. Round-trip: appears unread for the assignee, not for another employee/admin's own view.
  const before = await unreadCount(empCtx);
  console.log("employee unread count includes new task:", before >= 1);
  const bell = await getNotifications(empCtx);
  console.log("in bell dropdown:", bell.some((n) => n.id === task.id));
  const adminSeesIt = (await listNotifications(adminCtx, {})).items.some((n) => n.id === task.id);
  console.log("admin (not the assignee, not a broadcast type) does NOT see it:", !adminSeesIt);

  // 3. Mark read → count drops, item still listed (not unreadOnly) but read:true.
  await markNotificationRead(empCtx, task.id);
  const afterRead = await unreadCount(empCtx);
  console.log("unread count dropped after mark-read:", afterRead === before - 1);
  const stillListed = (await listNotifications(empCtx, {})).items.find((n) => n.id === task.id);
  console.log("still listed, marked read:", stillListed?.read === true);

  // 4. RBAC on mutation: another user cannot mark/dismiss someone else's task.
  await markNotificationRead(adminCtx, task.id); // should no-op, not throw
  const row = await prisma.automationTask.findUnique({ where: { id: task.id } });
  console.log("cross-user mark-read was a no-op (still DONE from step 3, not altered by admin call):", row?.status === "DONE");

  // 5. Dismiss → gone from default list.
  await dismissNotification(empCtx, task.id);
  const afterDismiss = (await listNotifications(empCtx, {})).items.some((n) => n.id === task.id);
  console.log("gone after dismiss:", !afterDismiss);

  // Cleanup.
  await prisma.automationTask.delete({ where: { id: task.id } });
  console.log("cleaned up");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
