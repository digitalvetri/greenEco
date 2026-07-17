/**
 * Verifies Phase 5a (named job titles + in-app create-user) against the live DB.
 * Creates and cleans up a disposable user. Run: npx tsx scripts/verify-phase5a.ts
 */
import { prisma } from "@/lib/prisma";
import { createUser, setUserJobTitle } from "@/server/services/user-admin";
import { verifyPassword } from "@/lib/password";

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "admin@greeneco.in" } });
  if (!admin) throw new Error("seeded admin not found");
  const ctx = { userId: admin.id, role: admin.role as "ADMIN" | "EMPLOYEE", companyId: admin.companyId };

  const email = `verify-phase5a-${Date.now()}@greeneco.in`;
  const { id } = await createUser(ctx, {
    name: "Verify Phase5a",
    phone: "9000000001",
    email,
    password: "TempPass123",
    role: "EMPLOYEE",
    jobTitle: "SITE_ENGINEER",
  });
  console.log("created user id:", id);

  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) throw new Error("user not persisted");
  console.log("jobTitle persisted:", row.jobTitle);
  console.log("password verifies:", verifyPassword("TempPass123", row.passwordHash));

  try {
    await createUser(ctx, { name: "Dup", phone: "9000000002", email, password: "TempPass123", role: "EMPLOYEE", jobTitle: null });
    console.log("FAIL: duplicate email did not throw");
  } catch (e) {
    console.log("duplicate email correctly rejected:", e instanceof Error ? e.message : e);
  }

  await setUserJobTitle(ctx, id, "PROJECT_MANAGER");
  const row2 = await prisma.user.findUnique({ where: { id } });
  console.log("jobTitle updated to:", row2?.jobTitle);

  const emp = await prisma.user.findFirst({ where: { email: "employee@greeneco.in" } });
  if (emp) {
    const empCtx = { userId: emp.id, role: emp.role as "ADMIN" | "EMPLOYEE", companyId: emp.companyId };
    try {
      await createUser(empCtx, { name: "X", phone: "9000000003", email: `x-${Date.now()}@greeneco.in`, password: "TempPass123", role: "EMPLOYEE", jobTitle: null });
      console.log("FAIL: employee was able to create a user");
    } catch (e) {
      console.log("employee correctly blocked:", e instanceof Error ? e.message : e);
    }
  }

  const audits = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
  console.log("audit rows for this user:", audits.map((a) => a.action));

  await prisma.auditLog.deleteMany({ where: { entityId: id } });
  await prisma.user.delete({ where: { id } });
  console.log("cleaned up disposable user");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
