import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markAllNotificationsRead as markAllRead } from "@/server/services/notifications";

export async function POST() {
  try {
    const session = await getSession();
    await markAllRead(session);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
