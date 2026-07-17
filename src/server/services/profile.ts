import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { Session } from "@/lib/auth";

/**
 * Self-service profile for the signed-in user (available to every role — an
 * EMPLOYEE can update their own details and password too). All writes are scoped
 * to `session.userId` and audited; nobody can edit another user's profile here.
 */

export interface MyProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  companyName: string;
  memberSince: string | null;
}

export async function getMyProfile(session: Session): Promise<MyProfile> {
  const [user, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.company.findUnique({ where: { id: session.companyId } }),
  ]);
  return {
    id: session.userId,
    name: user?.name ?? session.name,
    email: user?.email ?? null,
    phone: user?.phone ?? "",
    role: session.role,
    avatarUrl: user?.avatarUrl ?? null,
    hasPassword: !!user?.passwordHash,
    companyName: company?.name ?? "—",
    memberSince: user?.createdAt ? user.createdAt.toISOString() : null,
  };
}

/** Set or remove (url=null) the caller's own profile photo. Storage/validation
 *  already happened at /api/uploads — this just records the URL. */
export async function updateAvatar(session: Session, url: string | null): Promise<{ avatarUrl: string | null }> {
  await prisma.user.update({ where: { id: session.userId }, data: { avatarUrl: url } });
  await logAudit(session, {
    action: "UPDATE",
    entity: "User",
    entityId: session.userId,
    after: { avatarUrl: url },
  });
  return { avatarUrl: url };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  phone: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
});

export async function updateProfile(session: Session, input: unknown): Promise<{ name: string; phone: string }> {
  const data = profileSchema.parse(input);
  const before = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, phone: true },
  });
  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { name: data.name, phone: data.phone },
    select: { name: true, phone: true },
  });
  await logAudit(session, {
    action: "UPDATE",
    entity: "User",
    entityId: session.userId,
    before: before ?? undefined,
    after: user,
  });
  return user;
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  });

export async function changePassword(session: Session, input: unknown): Promise<{ ok: true }> {
  const data = passwordSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error("Account not found.");
  if (!user.passwordHash) {
    throw new Error("No password is set for this account yet — contact your administrator.");
  }
  if (!verifyPassword(data.currentPassword, user.passwordHash)) {
    throw new Error("Your current password is incorrect.");
  }
  if (verifyPassword(data.newPassword, user.passwordHash)) {
    throw new Error("New password must be different from your current one.");
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashPassword(data.newPassword) },
  });
  // Never log password material — record only that a change happened.
  await logAudit(session, {
    action: "UPDATE",
    entity: "User",
    entityId: session.userId,
    after: { passwordChanged: true },
  });
  return { ok: true };
}
