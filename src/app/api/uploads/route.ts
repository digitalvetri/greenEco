import { NextResponse } from "next/server";
import { getSession, AuthError } from "@/lib/auth";
import { saveUpload, UploadError } from "@/lib/storage";
import { check, clientIp } from "@/lib/rate-limit";
import { env } from "@/lib/env";

/** Multipart framing overhead allowance when checking Content-Length. */
const MULTIPART_SLACK = 512 * 1024;

/**
 * Upload endpoint. Auth-gated; enforces a size ceiling and a MIME/extension
 * allowlist; persists via the storage adapter (local in dev, S3/R2 in prod).
 *
 * Content-Length is checked *before* parsing, otherwise an oversized body is
 * truncated by the framework and surfaces as an opaque parse error instead of 413.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();

    // 30 uploads/min per user — field staff attach a few photos per action.
    const rl = check(`upload:${session.userId ?? clientIp(req)}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many uploads, slow down" },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
      );
    }

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > env.maxUploadBytes + MULTIPART_SLACK) {
      throw new UploadError(`File too large (max ${Math.round(env.maxUploadBytes / 1048576)}MB)`, 413);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new UploadError("Malformed upload", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new UploadError("No file provided", 400);
    }

    const saved = await saveUpload(file);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("upload failed", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
