import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ endpoint: z.string().min(1) });

/** Removes the caller's subscription for this browser/device (user turned
 *  notifications off, or the browser handed back an expired/invalid endpoint). Scoped
 *  to the caller's own userId — can't be used to drop someone else's subscription. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.data.endpoint, userId: session.userId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
}
