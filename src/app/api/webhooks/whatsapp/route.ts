import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { loadConfig } from "@/lib/runtime-config";
import { parseInboundWhatsApp } from "@/lib/whatsapp-inbound";
import { recordInboundWhatsApp } from "@/server/services/lead";
import { log, errFields } from "@/lib/logger";

/**
 * WhatsApp Cloud API webhook (two-way, spec §7.1). Excluded from Clerk auth
 * (server-to-server). ⚠️ Not testable here without a Meta number — the parser is
 * unit-tested (whatsapp-inbound.test.ts); this wires it to lead matching.
 *
 * Runbook: Meta → WhatsApp → Configuration → Callback URL {APP_URL}/api/webhooks/whatsapp,
 * Verify token = WHATSAPP_VERIFY_TOKEN, subscribe to "messages". Set WHATSAPP_APP_SECRET
 * for signature verification.
 */

// GET: Meta's subscription handshake — echo hub.challenge if the token matches.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  const verifyToken = (await loadConfig(env.companyId)).WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

function signatureValid(raw: string, header: string | null, appSecret: string): boolean {
  // Fail CLOSED in production: an unset app secret must NOT accept unsigned/spoofed inbound
  // messages (it previously skipped the check entirely). In dev, skip for convenience.
  if (!appSecret) return !env.isProduction;
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const appSecret = (await loadConfig(env.companyId)).WHATSAPP_APP_SECRET;
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  try {
    const messages = parseInboundWhatsApp(JSON.parse(raw));
    let recorded = 0;
    for (const m of messages) {
      const id = await recordInboundWhatsApp(m.from, m.text);
      if (id) recorded += 1;
    }
    // Always 200 so Meta doesn't retry; report how many matched a lead.
    return NextResponse.json({ ok: true, received: messages.length, recorded });
  } catch (e) {
    log.error("whatsapp inbound webhook failed", errFields(e));
    return NextResponse.json({ ok: true, error: "processing error" });
  }
}
