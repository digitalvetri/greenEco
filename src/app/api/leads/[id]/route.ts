import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, AuthError } from "@/lib/auth";
import { getLead, updateLead } from "@/server/services/lead";
import { updateLeadSchema } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    const lead = await getLead(session, id);
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    const input = updateLeadSchema.parse(await req.json());
    return NextResponse.json(await updateLead(session, id, input));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
      return NextResponse.json({ error: "Validation failed", issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 400 });
  }
}
