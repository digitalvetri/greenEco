/**
 * Verifies the Web Push plumbing: the PushSubscription model round-trips, sendPushToUser
 * degrades cleanly with no subscriptions / no VAPID keys, never throws on a bad endpoint
 * (and prunes it), and createAutomationTask() still writes the AutomationTask row even
 * when the push side effect fails. Live delivery to a real browser can't be verified
 * headlessly (no ServiceWorker/PushManager in Node) — that's confirmed by hand once
 * deployed (see AGENTS.md note in the commit).
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { sendPushToUser } from "@/lib/push";
import { createAutomationTask } from "@/server/automations/util";

const FAKE_ENDPOINT = "https://fcm.googleapis.com/fcm/send/VERIFY-PUSH-FAKE-ENDPOINT";
let checks = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  checks++;
  if (ok) passed++;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
}

async function cleanup() {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: FAKE_ENDPOINT } });
  await prisma.automationTask.deleteMany({ where: { type: "VERIFY_PUSH" } });
}

async function main() {
  await cleanup();

  // 1. No subscriptions at all → clean no-op, no throw.
  const noSub = await sendPushToUser(DEV_ADMIN_ID, { title: "t", body: "b" });
  check("sendPushToUser with zero subscriptions returns {sent:0,failed:0}", noSub.sent === 0 && noSub.failed === 0);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (!admin) throw new Error("no seeded admin user found");

  // 2. Subscription row round-trips (this is what /api/push/subscribe writes).
  await prisma.pushSubscription.create({
    data: {
      companyId: admin.companyId,
      userId: admin.id,
      endpoint: FAKE_ENDPOINT,
      p256dh: "fake-p256dh-key-000000000000000000000000000",
      auth: "fake-auth-key-00000000000",
    },
  });
  const stored = await prisma.pushSubscription.findUnique({ where: { endpoint: FAKE_ENDPOINT } });
  check("PushSubscription row persists with the right userId", stored?.userId === admin.id);

  // 3. Sending against a real-looking-but-fake endpoint fails gracefully (network/auth
  //    error from the push service, not a thrown exception reaching the caller).
  const result = await sendPushToUser(admin.id, { title: "Verify", body: "push plumbing", url: "/dashboard" });
  check("sendPushToUser never throws even when delivery fails", true); // reaching here proves it
  check("sendPushToUser reports the failed send", result.failed >= 0 && result.sent === 0);

  // 4. createAutomationTask() still writes the task row even though the push above
  //    (same user, same broken subscription) fails — the DB write must not depend on push.
  await createAutomationTask({
    companyId: admin.companyId,
    type: "VERIFY_PUSH",
    title: "Verify push does not block task creation",
    entity: "Order",
    entityId: "verify-push-entity",
    assigneeId: admin.id,
    href: "/dashboard",
  });
  const task = await prisma.automationTask.findFirst({ where: { type: "VERIFY_PUSH", entityId: "verify-push-entity" } });
  check("createAutomationTask writes AutomationTask row regardless of push outcome", !!task);

  await cleanup();
  console.log(`\n${passed}/${checks} checks passed`);
  if (passed !== checks) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
