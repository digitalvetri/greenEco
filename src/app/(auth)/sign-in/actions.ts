"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * Credentials login. One form for both roles — the ROLE comes from the matched user
 * row, not the form. Generic error on any failure (no user-enumeration). On success,
 * sets the signed httpOnly session cookie and redirects to the dashboard.
 */
export async function loginAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Clear any dev role toggle so the real login is authoritative.
  store.delete("dev_role");

  // Best-effort: a logging hiccup must never block a legitimate sign-in.
  try {
    await logAudit({ userId: user.id, role: user.role, companyId: user.companyId }, { action: "LOGIN", entity: "User", entityId: user.id });
  } catch {
    // swallow — login must succeed regardless of audit-log availability
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete("dev_role");
  redirect("/sign-in");
}
