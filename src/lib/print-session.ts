import { notFound } from "next/navigation";
import { getSession, type Session } from "./auth";
import { verifyPrintToken, type PrintClaims } from "./print-token";

/**
 * Resolve the session for a /print/* page. Two callers:
 *   1. A human viewing the page — has a Clerk cookie → getSession().
 *   2. The headless PDF renderer — no cookie, passes ?t=<print-token>.
 *
 * A print token is accepted ONLY when it is valid AND names this exact document
 * (docType + docId), so a token minted for one invoice can't render another.
 * The token's role/companyId flow into the returned session, so downstream
 * field-stripping (rbac) still applies exactly as for a cookie session.
 */
export async function getPrintSession(
  token: string | undefined,
  docType: PrintClaims["docType"],
  docId: string,
): Promise<Session> {
  if (token) {
    const r = verifyPrintToken(token);
    if (r.ok && r.claims.docType === docType && r.claims.docId === docId) {
      return {
        userId: r.claims.userId,
        role: r.claims.role,
        companyId: r.claims.companyId,
        name: "PDF Renderer",
        avatarUrl: null,
      };
    }
    // A token was supplied but is invalid/mismatched — fail closed with a clean
    // 404 (reveals nothing; never falls back to a cookie the renderer lacks).
    notFound();
  }
  return getSession();
}
