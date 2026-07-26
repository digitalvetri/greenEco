import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { env } from "@/lib/env";
import { putObject } from "@/lib/storage";
import { loadConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** TEMPORARY diagnostic route — pins down the /pdfs 404. Remove after use. */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== env.cronKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = await loadConfig();
  const result: Record<string, unknown> = {
    cwd: process.cwd(),
    storageDriver: env.storageDriver,
    hasGeminiKey: Boolean(cfg.GEMINI_API_KEY),
    geminiImageModel: cfg.GEMINI_IMAGE_MODEL || env.geminiImageModel,
  };
  try {
    const key = `pdfs/_diag-${Date.now()}.txt`;
    const url = await putObject(key, Buffer.from("diag"), "text/plain");
    result.putObjectUrl = url;
    const full = path.join(process.cwd(), "public", key);
    result.expectedDiskPath = full;
    const readBack = await readFile(full, "utf8");
    result.readBackOk = readBack === "diag";
  } catch (e) {
    result.writeError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return NextResponse.json(result);
}
