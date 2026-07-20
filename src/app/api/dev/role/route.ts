import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Dev-only role switcher. Sets a `dev_role` cookie so both ADMIN and EMPLOYEE
 * can be exercised in one browser without restarting. No-op when AUTH_MODE=clerk.
 */
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  const back = req.nextUrl.searchParams.get("back") ?? "/dashboard";
  const res = NextResponse.redirect(new URL(back, req.url));
  if (env.authMode === "dev" && (role === "ADMIN" || role === "EMPLOYEE")) {
    res.cookies.set("dev_role", role, { httpOnly: true, path: "/", sameSite: "lax" });
  }
  return res;
}
