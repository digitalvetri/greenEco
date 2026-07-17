import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import type { Ctx } from "@/lib/rbac";

/**
 * Admin-only user management. Distinct from profile.ts (self-service, scoped to
 * `session.userId`, requires the current password) — these act on ANOTHER user,
 * company-scoped, admin-only.
 */

const resetSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/** Admin resets another user's password directly — no current-password check.
 *  Never logs the password itself, only that a reset happened. */
export async function adminResetPassword(ctx: Ctx, targetUserId: string, newPassword: string): Promise<{ ok: true }> {
  requireAdmin(ctx);
  const parsed = resetSchema.safeParse({ newPassword });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid password");
  const pw = parsed.data.newPassword;
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId: ctx.companyId } });
  if (!target) throw new Error("User not found");
  await prisma.user.update({ where: { id: targetUserId }, data: { passwordHash: hashPassword(pw) } });
  await logAudit(ctx, { action: "UPDATE", entity: "User", entityId: targetUserId, after: { passwordResetByAdmin: true } });
  return { ok: true };
}
