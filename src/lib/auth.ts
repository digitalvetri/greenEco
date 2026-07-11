import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { env, DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "./env";
import type { Ctx } from "./rbac";
import { SESSION_COOKIE, verifySessionToken } from "./session";

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

/**
 * Local/self-hosted auth (AUTH_MODE=dev). Order of precedence:
 *  1. A valid signed session cookie (the real credentials login) → that user's role.
 *  2. Only if AUTH_DEV_BYPASS is on (dev/test): the `dev_role` cookie / DEV_ROLE env.
 *  3. Otherwise FAIL CLOSED — AuthError(401). A tampered/expired session cookie counts
 *     as "no session" and never falls back to a role in production.
 */
async function getDevSession(): Promise<Session> {
  let devRoleCookie: string | undefined;
  let sessionToken: string | undefined;
  try {
    const store = await cookies();
    devRoleCookie = store.get("dev_role")?.value;
    sessionToken = store.get(SESSION_COOKIE)?.value;
  } catch {
    /* cookies() unavailable outside a request scope. */
  }

  // 1) Real login — a valid signed session cookie wins over everything.
  const uid = verifySessionToken(sessionToken);
  if (uid) {
    const dbUser = await prisma.user.findUnique({ where: { id: uid } });
    if (dbUser && dbUser.active) {
      return { userId: dbUser.id, role: dbUser.role, companyId: dbUser.companyId, name: dbUser.name };
    }
    // Cookie valid but the user is gone/deactivated → not signed in.
    if (!env.authDevBypass) throw new AuthError("Session no longer valid", 401);
  }

  // 2) Dev/test bypass only.
  if (env.authDevBypass) {
    const role: Role = devRoleCookie === "ADMIN" || devRoleCookie === "EMPLOYEE" ? devRoleCookie : env.devRole;
    const userId = role === "ADMIN" ? DEV_ADMIN_ID : DEV_EMPLOYEE_ID;
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    return {
      userId,
      role,
      companyId: dbUser?.companyId ?? env.companyId,
      name: dbUser?.name ?? (role === "ADMIN" ? "Dev Admin" : "Dev Employee"),
    };
  }

  // 3) Production, no valid session → fail closed.
  throw new AuthError("Not signed in", 401);
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
