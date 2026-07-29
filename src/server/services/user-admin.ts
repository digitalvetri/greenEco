import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit, type AuditAction } from "@/lib/audit";
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

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  phone: z.string().min(1, "Phone is required").max(20),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  jobTitle: z.string().trim().min(1).max(60).nullable().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * In-app user creation — credentials-login (AUTH_MODE=dev) only. In AUTH_MODE=clerk,
 * users are provisioned by the Clerk webhook from publicMetadata, so this path is
 * intentionally not used there; callers must check `env.authMode !== "clerk"` before
 * exposing the UI (mirrors the notFound() gating on other admin-only sub-pages).
 */
export async function createUser(ctx: Ctx, input: CreateUserInput): Promise<{ id: string }> {
  requireAdmin(ctx);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { name, phone, email, password, role, jobTitle } = parsed.data;

  const id = randomUUID();
  try {
    await prisma.user.create({
      data: {
        id,
        companyId: ctx.companyId,
        name,
        phone,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        role,
        jobTitle: jobTitle ?? null,
        active: true,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("A user with this email already exists.");
    }
    throw e;
  }
  await logAudit(ctx, { action: "CREATE", entity: "User", entityId: id, after: { name, email, role, jobTitle: jobTitle ?? null } });
  return { id };
}

const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  phone: z.string().min(1, "Phone is required").max(20),
  email: z.string().email("Enter a valid email").nullable(),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  active: z.boolean(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Admin edits another user's core details (name/phone/email/role/active) — the
 * "admin can completely edit the employee data" ask. Deliberately excludes the
 * caller's own row (self-edits go through profile.ts's current-password-checked
 * flow instead — this is for editing OTHERS). Guards against locking the company
 * out of its own admin seat: can't demote or deactivate the last active admin.
 */
export async function adminUpdateUser(ctx: Ctx, targetUserId: string, input: UpdateUserInput): Promise<{ ok: true }> {
  requireAdmin(ctx);
  if (targetUserId === ctx.userId) throw new Error("Edit your own details from your profile card instead.");
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { name, phone, email, role, active } = parsed.data;

  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId: ctx.companyId } });
  if (!target) throw new Error("User not found");

  const losingAdmin = target.role === "ADMIN" && target.active && (role !== "ADMIN" || !active);
  if (losingAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { companyId: ctx.companyId, role: "ADMIN", active: true, id: { not: targetUserId } },
    });
    if (otherActiveAdmins === 0) throw new Error("Can't remove the only active admin — promote someone else first.");
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { name, phone, email: email ? email.toLowerCase() : null, role, active },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("A user with this email already exists.");
    }
    throw e;
  }
  await logAudit(ctx, {
    action: "UPDATE",
    entity: "User",
    entityId: targetUserId,
    before: { name: target.name, phone: target.phone, email: target.email, role: target.role, active: target.active },
    after: { name, phone, email, role, active },
  });
  return { ok: true };
}

/**
 * Permanently removes a user account. Every other model keeps userId/createdById/
 * assignedToId as a bare string (documented convention — no Prisma relation to User
 * anywhere), so this is safe referentially: other records simply keep an orphaned id,
 * the same "Unknown" display fallback already used e.g. in the activity log. Guards
 * against deleting yourself (use deactivate via Edit instead) and the last active admin.
 */
export async function deleteUser(ctx: Ctx, targetUserId: string): Promise<{ ok: true }> {
  requireAdmin(ctx);
  if (targetUserId === ctx.userId) throw new Error("You can't delete your own account.");
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId: ctx.companyId } });
  if (!target) throw new Error("User not found");

  if (target.role === "ADMIN" && target.active) {
    const otherActiveAdmins = await prisma.user.count({
      where: { companyId: ctx.companyId, role: "ADMIN", active: true, id: { not: targetUserId } },
    });
    if (otherActiveAdmins === 0) throw new Error("Can't delete the only active admin — promote someone else first.");
  }

  await prisma.user.delete({ where: { id: targetUserId } });
  await logAudit(ctx, { action: "DELETE", entity: "User", entityId: targetUserId, before: { name: target.name, phone: target.phone, role: target.role } });
  return { ok: true };
}

/** Retroactively assign/change a job title on an existing user — display-only, no permission effect. */
export async function setUserJobTitle(ctx: Ctx, targetUserId: string, jobTitle: string | null): Promise<{ ok: true }> {
  requireAdmin(ctx);
  const clean = jobTitle?.trim() || null;
  if (clean && clean.length > 60) throw new Error("Job title is too long");
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId: ctx.companyId } });
  if (!target) throw new Error("User not found");
  await prisma.user.update({ where: { id: targetUserId }, data: { jobTitle: clean } });
  await logAudit(ctx, { action: "UPDATE", entity: "User", entityId: targetUserId, before: { jobTitle: target.jobTitle }, after: { jobTitle: clean } });
  return { ok: true };
}

export interface AuditLogRow {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  userName: string;
  createdAt: string;
}

/**
 * Company-wide activity log. Admin-gated, NOT true per-job-title-gated — there is no
 * finer authorization layer yet to distinguish "MD" from other admin-tier titles, so
 * any ADMIN user can see this (a Phase-B limitation to flag to the client, not a bug).
 */
export async function listAuditLog(
  ctx: Ctx,
  filters: { action?: AuditAction; cursor?: string } = {},
): Promise<{ items: AuditLogRow[]; nextCursor: string | null }> {
  requireAdmin(ctx);
  const LIMIT = 50;
  const where: Prisma.AuditLogWhereInput = {
    companyId: ctx.companyId,
    ...(filters.action ? { action: filters.action } : {}),
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIMIT + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > LIMIT;
  const page = hasMore ? rows.slice(0, LIMIT) : rows;

  const userIds = [...new Set(page.map((r) => r.userId))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action as AuditAction,
      entity: r.entity,
      entityId: r.entityId,
      userName: nameMap.get(r.userId) ?? "Unknown",
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
