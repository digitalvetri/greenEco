import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

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
 * Deliberately no auth: these are the SAME public-but-unguessable URLs
 * (storage.ts's randomKey/randomUUID) a customer opens from a WhatsApp/email
 * link with no login — this route must stay exactly as open as static
 * public/ serving was.
 */
const ALLOWED_ROOTS = ["uploads", "pdfs"];

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
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
