"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  createDrawingRequest,
  assignDrawingRequest,
  deliverDrawing,
  reviewDelivery,
  cancelDrawingRequest,
  reopenDrawingRequest,
  setApproval,
  type CreateDrawingRequestInput,
} from "@/server/services/drawing";

/** Every action re-reads the session, so a revoked capability takes effect immediately
 *  — the client can't replay an action it was allowed to render a minute ago. */

export async function createDrawingRequestAction(input: CreateDrawingRequestInput) {
  const s = await getSession();
  const req = await createDrawingRequest(s, input);
  revalidatePath("/drawings");
  return { id: req.id };
}

export async function assignDrawingRequestAction(id: string, assignedToId: string | null) {
  const s = await getSession();
  await assignDrawingRequest(s, id, assignedToId);
  revalidatePath("/drawings");
  return { ok: true };
}

export async function deliverDrawingAction(id: string, file: { fileUrl: string; changeNote?: string }) {
  const s = await getSession();
  const res = await deliverDrawing(s, id, file);
  revalidatePath("/drawings");
  // A project drawing also shows on the project page's Drawings tab.
  if (res.drawing.orderId) revalidatePath(`/projects/${res.drawing.orderId}`);
  return { revision: res.drawing.revision };
}

export async function reviewDeliveryAction(
  id: string,
  verdict: "ACCEPT" | "REQUEST_CHANGES",
  changeReason?: string,
) {
  const s = await getSession();
  await reviewDelivery(s, id, verdict, changeReason);
  revalidatePath("/drawings");
  return { ok: true };
}

export async function cancelDrawingRequestAction(id: string, reason?: string) {
  const s = await getSession();
  await cancelDrawingRequest(s, id, reason);
  revalidatePath("/drawings");
  return { ok: true };
}

export async function reopenDrawingRequestAction(id: string) {
  const s = await getSession();
  await reopenDrawingRequest(s, id);
  revalidatePath("/drawings");
  return { ok: true };
}

export async function setDrawingApprovalAction(
  drawingId: string,
  status: "DRAFT" | "FOR_APPROVAL" | "APPROVED",
) {
  const s = await getSession();
  await setApproval(s, drawingId, status);
  revalidatePath("/drawings");
  return { ok: true };
}
