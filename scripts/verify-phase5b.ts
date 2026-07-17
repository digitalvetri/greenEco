/**
 * Verifies Phase 5b (activity log service) against the live DB.
 * Run: npx tsx scripts/verify-phase5b.ts
 */
import { prisma } from "@/lib/prisma";
import { listAuditLog } from "@/server/services/user-admin";
import { logAudit } from "@/lib/audit";

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "admin@greeneco.in" } });
  if (!admin) throw new Error("seeded admin not found");
  const ctx = { userId: admin.id, role: admin.role as "ADMIN" | "EMPLOYEE", companyId: admin.companyId };

  await logAudit(ctx, { action: "LOGIN", entity: "User", entityId: admin.id });

  const page1 = await listAuditLog(ctx, {});
  console.log("total returned (first page):", page1.items.length, "nextCursor:", page1.nextCursor);
  console.log("newest action:", page1.items[0]?.action, page1.items[0]?.userName);
  if (page1.items[0]?.action !== "LOGIN") throw new Error("expected newest row to be the LOGIN we just wrote");

  const filtered = await listAuditLog(ctx, { action: "LOGIN" });
  console.log("LOGIN-filtered count on first page:", filtered.items.length, "all LOGIN:", filtered.items.every((r) => r.action === "LOGIN"));

  const emp = await prisma.user.findFirst({ where: { email: "employee@greeneco.in" } });
  if (emp) {
    const empCtx = { userId: emp.id, role: emp.role as "ADMIN" | "EMPLOYEE", companyId: emp.companyId };
    try {
      await listAuditLog(empCtx, {});
      console.log("FAIL: employee could read the activity log");
    } catch (e) {
      console.log("employee correctly blocked:", e instanceof Error ? e.message : e);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
