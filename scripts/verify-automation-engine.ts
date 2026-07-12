/**
 * Verifies the Automation Engine core (Wave 0): deliver() idempotency (a SENT dedupeKey
 * is skipped on retry), dry-run (logs DRY_RUN under a namespaced key, sends nothing, never
 * blocks a real send), the kill switch, and that A1 (followup-digest) runs + is idempotent.
 * Uses fixed "verify:"-prefixed keys and cleans them up.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { env } from "@/lib/env";
import { deliver, alreadySent } from "@/server/automations/deliver";
import { runAutomation, setSetting, isEnabled } from "@/server/automations/engine";
import { registerAll } from "@/server/automations";
import type { AutomationContext } from "@/server/automations/types";

const KEYS = ["verify:eng:idem", "verify:eng:dry", "dry:verify:eng:dry"];

async function cleanup() {
  await prisma.automationLog.deleteMany({ where: { dedupeKey: { in: KEYS } } });
  await prisma.automationLog.deleteMany({ where: { name: "followup-digest", dedupeKey: { startsWith: "dry:A1:" } } });
  await prisma.automationSetting.deleteMany({ where: { key: "A1.enabled" } });
}

async function main() {
  registerAll();
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const companyId = admin.companyId;
  await cleanup();
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  // 1 — deliver idempotency via INAPP (which "sends" without a provider).
  const d1 = await deliver({ name: "verify", companyId, channel: "INAPP", to: "u1", body: "x", dedupeKey: "verify:eng:idem" });
  check("first deliver sends (INAPP)", d1.status === "SENT" && d1.sent);
  const d2 = await deliver({ name: "verify", companyId, channel: "INAPP", to: "u1", body: "x", dedupeKey: "verify:eng:idem" });
  check("second deliver with same key is skipped", d2.status === "SKIPPED" && !d2.sent);
  check("alreadySent() true for a SENT key", await alreadySent("verify:eng:idem"));

  // 2 — dry-run logs under dry: and never blocks a real send.
  const dry = await deliver({ name: "verify", companyId, channel: "INAPP", to: "u1", body: "x", dedupeKey: "verify:eng:dry", dryRun: true });
  check("dry-run returns DRY_RUN, sends nothing", dry.status === "DRY_RUN" && !dry.sent);
  check("dry-run does NOT create a SENT row for the real key", !(await alreadySent("verify:eng:dry")));
  const dryLog = await prisma.automationLog.findUnique({ where: { dedupeKey: "dry:verify:eng:dry" } });
  check("dry-run logged under the dry: namespace", dryLog?.status === "DRY_RUN");
  const real = await deliver({ name: "verify", companyId, channel: "INAPP", to: "u1", body: "x", dedupeKey: "verify:eng:dry" });
  check("real send after a dry-run still sends", real.status === "SENT");

  // 3 — kill switch.
  check("automation enabled by default", await isEnabled(companyId, "A1"));
  await setSetting(companyId, "A1.enabled", false);
  const ctx: AutomationContext = { companyId, now: new Date(), dryRun: true };
  const disabled = await runAutomation("followup-digest", ctx);
  check("disabled automation is a no-op", (disabled.details as { disabled?: boolean })?.disabled === true);
  await setSetting(companyId, "A1.enabled", true);

  // 4 — A1 runs (dry-run) and is idempotent on a fixed `now`.
  const now = new Date();
  const r1 = await runAutomation("followup-digest", { companyId, now, dryRun: false });
  check("A1 runs and returns details", typeof (r1.details as { dueToday?: number })?.dueToday === "number");
  const r2 = await runAutomation("followup-digest", { companyId, now, dryRun: false });
  check("A1 second run on same `now` sends 0 (idempotent)", r2.sent === 0);

  await cleanup();
  console.log(`\n✅ Automation Engine (Wave 0 + A1) verified — ${pass} checks passed (company ${companyId}, app ${env.appUrl})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    await cleanup();
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
