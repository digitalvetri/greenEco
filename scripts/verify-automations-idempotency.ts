/**
 * Global regression guard (AUTOMATION-ENGINE-SPEC §8): runs every SCHEDULED automation twice
 * with the same `now` and asserts the second run sends 0 (idempotent) and never throws. Uses
 * real seeded data; dry-run so nothing is delivered. Cleans up its dry-run logs.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { registerAll } from "@/server/automations";
import { runAutomation, scheduledNames } from "@/server/automations/engine";

async function main() {
  registerAll();
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const companyId = admin.companyId;
  const now = new Date();
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const names = scheduledNames();
  check("scheduled automations are registered", names.length >= 6);

  for (const name of names) {
    const first = await runAutomation(name, { companyId, now, dryRun: true });
    const second = await runAutomation(name, { companyId, now, dryRun: true });
    check(`${name}: runs twice without error, 2nd sends 0`, second.sent === 0 && !!first.details && !!second.details);
  }

  await prisma.automationLog.deleteMany({ where: { dedupeKey: { startsWith: "dry:" } } });
  console.log(`\n✅ Automation idempotency verified — ${pass} checks across ${names.length} scheduled automations`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    await prisma.automationLog.deleteMany({ where: { dedupeKey: { startsWith: "dry:" } } }).catch(() => {});
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
