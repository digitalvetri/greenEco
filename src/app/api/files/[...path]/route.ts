import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serves files written at runtime under public/uploads and public/pdfs.
 *
 * `next start` maps the public/ directory to routes at BUILD time — any file
 * saveUpload()/putObject() write there later (uploads, generated PDFs, AI
 * images) is invisible to Next's own static-file router and 404s, even though
 * it genuinely exists on disk (confirmed: write + immediate fs.readFile both
 * succeed, only the HTTP request 404s). next.config.ts rewrites /uploads/* and
 * /pdfs/* here (beforeFiles, so it runs before that failing manifest check).
 *
 * ## Two access tiers, on purpose
 *
 * `uploads/` and `pdfs/` are deliberately **open**: these are the same
 * public-but-unguessable URLs (storage.ts's randomKey/randomUUID) a customer opens
 * from a WhatsApp/email link with no login. That must stay exactly as open as static
 * public/ serving was — gating it would break every invoice link already sent.
 *
 * `secure/` **requires a signed-in session**. Engineering drawings are internal
 * documents that no customer receives by link, so an unguessable URL isn't the right
 * control for them: a forwarded link, a browser history export or a shared screenshot
 * would hand them out permanently. Anyone signed in to the workspace may read them —
 * per-drawing authorization stays in the service layer, which is where it belongs;
 * this is the "not the open internet" boundary.
 *
 * ⚠️ **Local storage driver only.** Under STORAGE_DRIVER=s3 a stored file's URL is an
 * absolute bucket URL that never reaches this route, so bucket ACLs are the access
 * control there. Keep the `secure/` prefix private in the bucket policy.
 */
const OPEN_ROOTS = ["uploads", "pdfs"];
/** Roots that require a session. Prefix chosen to avoid colliding with the /drawings page route. */
const AUTHED_ROOTS = ["secure"];
const ALLOWED_ROOTS = [...OPEN_ROOTS, ...AUTHED_ROOTS];

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".dwg": "application/acad",
  ".dxf": "application/dxf",
  ".txt": "text/plain",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (segments.length === 0 || !ALLOWED_ROOTS.includes(segments[0])) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authed = AUTHED_ROOTS.includes(segments[0]);
  if (authed) {
    try {
      await getSession();
    } catch {
      // 404, not 401 — a signed-out probe learns nothing about whether the key exists,
      // and the response is identical to a wrong guess. Same reasoning as the print
      // token's forged-token handling.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const base = path.join(process.cwd(), "public");
  const full = path.join(base, ...segments);
  // Reject any resolved path that escapes the public/ root (blocks ../ traversal).
  if (!full.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const st = await stat(full);
    if (!st.isFile()) throw new Error("not a file");
    const bytes = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(st.size),
        // `public` would let a shared/CDN cache store an authed file and hand it to a
        // signed-out request — the gate above would be pointless. Keys are immutable
        // either way (random UUID per file), so `private` costs nothing but a shared hit.
        "Cache-Control": authed
          ? "private, max-age=31536000, immutable"
          : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
