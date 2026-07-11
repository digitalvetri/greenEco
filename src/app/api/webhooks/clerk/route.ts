import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Clerk webhook → provisions the local User row (id, name, phone, role, tenant).
 * getSession() refuses to authenticate a Clerk user without a provisioned row,
 * so this is what grants access to a workspace.
 *
 * Configure in Clerk: endpoint = {APP_URL}/api/webhooks/clerk, events =
 * user.created, user.updated, user.deleted. Set CLERK_WEBHOOK_SECRET.
 */

interface ClerkUser {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email_addresses?: { email_address: string }[];
  phone_numbers?: { phone_number: string }[];
  public_metadata?: { role?: string; companyId?: string };
}

export async function POST(req: Request) {
  if (!env.clerkWebhookSecret) {
    return NextResponse.json({ error: "CLERK_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: { type: string; data: ClerkUser };
  try {
    evt = new Webhook(env.clerkWebhookSecret).verify(payload, headers) as typeof evt;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const u = evt.data;

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
      u.email_addresses?.[0]?.email_address ||
      "User";
    const phone = u.phone_numbers?.[0]?.phone_number ?? "";
    const role: Role = u.public_metadata?.role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
    const companyId = u.public_metadata?.companyId ?? env.companyId;

    // Only provision into a company that actually exists (tenant guard).
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: `Unknown companyId: ${companyId}` }, { status: 422 });
    }

    await prisma.user.upsert({
      where: { id: u.id },
      update: { name, phone, role, companyId, active: true },
      create: { id: u.id, name, phone, role, companyId, active: true },
    });
    return NextResponse.json({ ok: true, provisioned: u.id });
  }

  if (evt.type === "user.deleted") {
    await prisma.user.updateMany({ where: { id: u.id }, data: { active: false } });
    return NextResponse.json({ ok: true, deactivated: u.id });
  }

  return NextResponse.json({ ok: true, ignored: evt.type });
}
