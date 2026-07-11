import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Edge middleware (spec §Auth). Two modes, selected by AUTH_MODE:
 *  - "dev" (default): pass through with baseline security headers. The dev-shim
 *    in src/lib/auth.ts authenticates requests.
 *  - "clerk": Clerk protects the dashboard + API routes; getSession() (auth.ts)
 *    reads the Clerk session. Requires the Clerk keys in the environment.
 * Clerk is installed but only invoked when AUTH_MODE=clerk, so dev never touches it.
 */
/**
 * Routes that require a signed-in Clerk user (AUTH_MODE=clerk only).
 *
 * Deliberately EXCLUDED:
 *  - /print/*         — authed by a short-lived signed print token (lib/print-token),
 *                       because the headless PDF renderer carries no session cookie.
 *  - /api/webhooks/*  — Clerk/n8n call these server-to-server with no cookie; they
 *                       verify their own svix/HMAC signatures.
 *  - /api/cron        — invoked by the scheduler with an x-cron-key header, no cookie.
 *  - /api/healthz     — must answer for uptime probes without auth.
 * Everything else under the app + API is gated.
 */
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/leads(.*)",
  "/proposals(.*)",
  "/projects(.*)",
  "/clients(.*)",
  "/materials(.*)",
  "/erection(.*)",
  "/service(.*)",
  "/invoices(.*)",
  "/reports(.*)",
  "/settings(.*)",
  "/api/((?!webhooks|healthz|cron).*)",
]);

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Permissions-Policy", "geolocation=(self), microphone=(self), camera=(self)");
  return res;
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
  return withSecurityHeaders(NextResponse.next());
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (process.env.AUTH_MODE === "clerk") {
    return clerkHandler(req, ev);
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|uploads|sw.js|manifest.webmanifest).*)"],
};
