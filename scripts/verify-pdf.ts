/**
 * End-to-end proof that PDF generation produces real PDF bytes and persists
 * a durable URL. Requires the dev server running on APP_URL (default :3000).
 * Idempotent — overwrites the same storage key.
 */
import { prisma } from "@/lib/prisma";
import { generatePdf } from "@/server/services/pdf";
import { env, DEV_ADMIN_ID } from "@/lib/env";
import { stat, readFile } from "fs/promises";
import path from "path";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("Seed the DB first (npm run db:seed)");
  const ctx = { userId: admin.id, role: admin.role, companyId: admin.companyId };

  const inv = await prisma.invoice.findFirst({ where: { companyId: ctx.companyId }, orderBy: { date: "desc" } });
  if (!inv) throw new Error("No invoice found — run scripts/verify-execute.ts first");
  console.log(`Rendering invoice ${inv.invoiceNo} …`);

  const t0 = Date.now();
  const { url, bytes } = await generatePdf(ctx, "invoice", inv.invoiceNo);
  console.log(`  → ${bytes} bytes in ${Date.now() - t0}ms, url=${url}`);

  if (bytes < 1000) throw new Error(`PDF suspiciously small (${bytes} bytes)`);

  // Verify magic bytes on the persisted local file.
  if (env.storageDriver === "local") {
    const full = path.join(process.cwd(), "public", url.replace(/^\//, ""));
    const st = await stat(full);
    const head = (await readFile(full)).subarray(0, 5).toString("latin1");
    if (head !== "%PDF-") throw new Error(`Not a PDF: header=${JSON.stringify(head)}`);
    console.log(`  → file on disk ${st.size} bytes, header "%PDF-" ✓`);
  }

  // Confirm pdfUrl was persisted.
  const after = await prisma.invoice.findUnique({ where: { id: inv.id } });
  if (after?.pdfUrl !== url) throw new Error(`pdfUrl not persisted (got ${after?.pdfUrl})`);
  console.log(`  → invoice.pdfUrl persisted ✓`);

  console.log("✅ PDF generation verified");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
