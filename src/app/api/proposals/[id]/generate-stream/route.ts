import { NextResponse } from "next/server";
import { getSession, AuthError } from "@/lib/auth";
import { getProposal, generateForProposalStreaming } from "@/server/services/proposal";
import { jsonBody } from "@/lib/api";
import type { AiProposalInput } from "@/lib/ai";

/**
 * SSE proposal-draft generation (Phase 6). A Route Handler, not a Server Action —
 * Server Actions serialize their return value once at the end; they cannot flush
 * partial output as it's generated. `event: token` frames stream the technical
 * write-up prose word-by-word; a single `event: done` frame carries the full
 * persisted draft (BOQ/scope/payment terms) once generation + save complete.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await getSession();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;

  // Tenant/existence check BEFORE opening the stream — a cross-tenant probe gets a
  // clean 404, not a 200 response with an error event buried in the SSE body.
  const proposal = await getProposal(session, id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const input = (await jsonBody(req)) as AiProposalInput;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      try {
        const result = await generateForProposalStreaming(session, id, input, (text) => send("token", { text }));
        send("done", result);
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "Generation failed" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
