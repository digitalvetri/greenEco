import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { env, DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "./env";
import type { Ctx } from "./rbac";

/**
 * Auth boundary (spec §3). Pluggable:
 *   AUTH_MODE=dev   → fixed dev session (no Clerk keys needed)
 *   AUTH_MODE=clerk → real Clerk session; role from publicMetadata.role or the User row
 *
 * Tenant scoping (Phase 0): companyId is resolved from the authenticated User
 * row, never from an env default (env is only a bootstrap fallback in dev).
 * Wrapped in React cache() so it runs once per request, not once per call.
 */

export interface Session extends Ctx {
  name: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const getSession = cache(async (): Promise<Session> => {
  return env.authMode === "clerk" ? getClerkSession() : getDevSession();
});

async function getDevSession(): Promise<Session> {
  // Role toggled via DEV_ROLE env or the `dev_role` cookie (header switcher).
  let role: Role = env.devRole;
  try {
    const store = await cookies();
    const c = store.get("dev_role")?.value;
    if (c === "ADMIN" || c === "EMPLOYEE") role = c;
  } catch {
    /* cookies() unavailable outside a request scope — fall back to env. */
  }
  const userId = role === "ADMIN" ? DEV_ADMIN_ID : DEV_EMPLOYEE_ID;
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  return {
    userId,
    role,
    // Tenant comes from the user row; env is only a pre-seed bootstrap fallback.
    companyId: dbUser?.companyId ?? env.companyId,
    name: dbUser?.name ?? (role === "ADMIN" ? "Dev Admin" : "Dev Employee"),
  };
}

async function getClerkSession(): Promise<Session> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new AuthError("Not signed in", 401);

  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || !dbUser.active) {
    // The Clerk webhook provisions User rows; until then the account has no tenant.
    throw new AuthError("Your account is not provisioned for this workspace.", 403);
  }

  const claimRole = (sessionClaims?.publicMetadata as { role?: Role } | undefined)?.role;
  return {
    userId,
    role: claimRole ?? dbUser.role,
    companyId: dbUser.companyId,
    name: dbUser.name,
  };
}

export function requireAdmin(ctx: Ctx): void {
  if (ctx.role !== "ADMIN") throw new AuthError("Admin only", 403);
}

/**
 * EMPLOYEE may only touch Orders where a TeamAssignment exists (spec §6.3).
 * ADMIN has blanket access within their company.
 */
export async function requireProjectAccess(ctx: Ctx, orderId: string): Promise<void> {
  if (ctx.role === "ADMIN") return;
  const assignment = await prisma.teamAssignment.findUnique({
    where: { orderId_userId: { orderId, userId: ctx.userId } },
  });
  if (!assignment) throw new AuthError("No access to this project", 403);
}
