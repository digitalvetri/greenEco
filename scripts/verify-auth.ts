/**
 * Verifies the credentials-login primitives — scrypt hashing, signed-session
 * round-trip (tampered/expired → null), and that the seeded admin/employee
 * passwords authenticate to the correct roles. The fail-closed middleware/getSession
 * behaviour is exercised separately by the browser check (bypass off).
 */
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSessionToken, verifySessionToken } from "@/lib/session";

async function main() {
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  // 1 — password hashing.
  const h = hashPassword("Admin@123");
  check("hash is scrypt-formatted", h.startsWith("scrypt$"));
  check("correct password verifies", verifyPassword("Admin@123", h));
  check("wrong password rejected", !verifyPassword("wrong", h));
  check("empty/null stored rejected", !verifyPassword("x", null) && !verifyPassword("x", ""));

  // 2 — signed session round-trip + fail-closed on tamper/expiry.
  const now = 1_000_000;
  const tok = createSessionToken("dev-admin", now);
  check("valid token → uid", verifySessionToken(tok, now + 10) === "dev-admin");
  check("tampered token → null", verifySessionToken(tok.slice(0, -2) + "xy", now + 10) === null);
  check("expired token → null", verifySessionToken(tok, now + 60 * 60 * 24 * 8) === null);
  check("garbage token → null", verifySessionToken("not-a-token", now) === null);
  check("empty token → null", verifySessionToken("", now) === null && verifySessionToken(undefined, now) === null);

  // 3 — seeded credentials authenticate to the right roles (the actual login check).
  const admin = await prisma.user.findUnique({ where: { email: "admin@greeneco.in" } });
  const emp = await prisma.user.findUnique({ where: { email: "employee@greeneco.in" } });
  check("admin account seeded with a password", !!admin?.passwordHash && admin.role === "ADMIN");
  check("employee account seeded with a password", !!emp?.passwordHash && emp.role === "EMPLOYEE");
  check("admin password matches → ADMIN", verifyPassword("Admin@123", admin?.passwordHash) && admin?.role === "ADMIN");
  check("employee password matches → EMPLOYEE", verifyPassword("Employee@123", emp?.passwordHash) && emp?.role === "EMPLOYEE");
  check("admin password does NOT unlock employee (distinct creds)", !verifyPassword("Employee@123", admin?.passwordHash));

  console.log(`\n✅ Auth (credentials login) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
