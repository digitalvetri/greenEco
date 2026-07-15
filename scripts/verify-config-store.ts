/**
 * verify-config-store.ts — end-to-end proof of the runtime integration config:
 * encrypt/decrypt, DB-over-env resolution, cache-bust on write, the SAFE admin projection
 * (no secret plaintext), provider validation, and clear→env-fallback. Run:
 *   npx tsx scripts/verify-config-store.ts
 */
import "dotenv/config";
import { env } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/secrets-crypto";
import { loadConfig, invalidateConfig } from "@/lib/runtime-config";
import { getConfigOverview, setConfigValue, clearConfigValue } from "@/server/services/config-admin";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/rbac";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const ctx: Ctx = { userId: "dev-admin", role: "ADMIN", companyId: env.companyId };
  const employee: Ctx = { userId: "dev-emp", role: "EMPLOYEE", companyId: env.companyId };

  // Start clean.
  await prisma.configSetting.deleteMany({ where: { companyId: env.companyId, key: { in: ["GROQ_API_KEY", "CRON_KEY", "AI_TEXT_PROVIDER"] } } });
  invalidateConfig();

  console.log("1) crypto roundtrip");
  const secret = "gsk_test_ABCDEF1234567890";
  const enc = encryptSecret(secret);
  check("ciphertext != plaintext", enc !== secret && !enc.includes(secret));
  check("decrypt roundtrips", decryptSecret(enc) === secret);
  check("tampered ciphertext → null", decryptSecret(enc.slice(0, -4) + "AAAA") === null);
  check("garbage → null (no throw)", decryptSecret("not-base64!!") === null);

  console.log("2) save → DB overrides env, visible immediately (cache busted)");
  const r1 = await setConfigValue(ctx, "GROQ_API_KEY", secret);
  check("save ok", r1.ok);
  const cfg1 = await loadConfig(env.companyId);
  check("loadConfig reflects saved value", cfg1.GROQ_API_KEY === secret);

  console.log("3) stored at rest is ciphertext, not plaintext");
  const row = await prisma.configSetting.findFirst({ where: { companyId: env.companyId, key: "GROQ_API_KEY" } });
  check("row exists", !!row);
  check("valueEnc is encrypted (no plaintext)", !!row && !row.valueEnc.includes(secret));

  console.log("4) admin projection is SAFE — no secret plaintext leaves the service");
  const groups = await getConfigOverview(ctx);
  const flat = groups.flatMap((g) => g.items);
  const groq = flat.find((i) => i.key === "GROQ_API_KEY")!;
  check("groq item present + configured", !!groq && groq.configured);
  check("source is db", groq.source === "db");
  check("last4 exposed for recognition", groq.last4 === "7890");
  check("NO full value on a secret item", groq.value === undefined);
  const providerItem = flat.find((i) => i.key === "AI_TEXT_PROVIDER")!;
  check("non-secret item DOES carry its value", typeof providerItem.value === "string");
  // Serialize the whole projection and assert the secret can't be found anywhere in it.
  check("secret absent from serialized projection", !JSON.stringify(groups).includes(secret));

  console.log("5) provider validation");
  const bad = await setConfigValue(ctx, "AI_TEXT_PROVIDER", "gpt5");
  check("invalid provider rejected", !bad.ok);
  const good = await setConfigValue(ctx, "AI_TEXT_PROVIDER", "gemini");
  check("valid provider accepted", good.ok);
  check("provider resolves", (await loadConfig(env.companyId)).AI_TEXT_PROVIDER === "gemini");

  console.log("6) RBAC — employee cannot read or write config");
  let readBlocked = false;
  try {
    await getConfigOverview(employee);
  } catch {
    readBlocked = true;
  }
  check("employee getConfigOverview throws", readBlocked);
  let writeBlocked = false;
  try {
    await setConfigValue(employee, "GROQ_API_KEY", "x");
  } catch {
    writeBlocked = true;
  }
  check("employee setConfigValue throws", writeBlocked);

  console.log("7) unknown key rejected");
  const unknown = await setConfigValue(ctx, "DATABASE_URL", "postgres://evil");
  check("env-only/unknown key rejected", !unknown.ok);

  console.log("8) clear → falls back to env default");
  await clearConfigValue(ctx, "GROQ_API_KEY");
  const cfg2 = await loadConfig(env.companyId);
  check("cleared value falls back to env (default empty)", cfg2.GROQ_API_KEY === env.groqApiKey);
  const gone = await prisma.configSetting.findFirst({ where: { companyId: env.companyId, key: "GROQ_API_KEY" } });
  check("row deleted", !gone);

  // Clean up.
  await prisma.configSetting.deleteMany({ where: { companyId: env.companyId, key: { in: ["AI_TEXT_PROVIDER"] } } });
  invalidateConfig();

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
