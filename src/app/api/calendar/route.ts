import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { listCalendarEvents } from "@/server/services/calendar";
import type { CalendarStatusFilter } from "@/server/services/calendar";

const QuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string().optional(),
  owner: z.string().optional(),
  status: z.enum(["pending", "completed", "overdue"]).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession();
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

    const { from, to, type, owner, status } = parsed.data;
    const events = await listCalendarEvents(session, {
      from: new Date(from),
      to: new Date(to),
      type,
      ownerId: owner,
      status: status as CalendarStatusFilter,
    });
    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
