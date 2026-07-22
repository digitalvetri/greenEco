import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { check, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Registers (or refreshes) the caller's push subscription for this browser/device.
 *  `endpoint` is unique per registration — upsert on it, not per-user, since one user
 *  can have several devices subscribed at once. */
export async function POST(req: Request) {
  try {
    const session = await getSession();

    const rl = check(`push-sub:${session.userId ?? clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    const { endpoint, keys } = body.data;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        companyId: session.companyId,
        userId: session.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
      update: {
        companyId: session.companyId,
        userId: session.userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }
}
