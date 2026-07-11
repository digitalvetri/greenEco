"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  updateStage,
  addStagePhoto,
  addDrawing,
  setDrawingApproval,
  addReceipt,
  setMilestoneSchedule,
  setOrderGst,
  assignTeam,
  removeTeam,
  setOrderStatus,
  addOrderDocument,
  deleteOrderDocument,
  logProjectComm,
  sendProjectWhatsApp,
  sendProjectEmail,
  archiveOrder,
} from "@/server/services/order";
import { redirect } from "next/navigation";
import { createInvoiceFromMilestone } from "@/server/services/invoice";

export async function setOrderStatusAction(orderId: string, status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED") {
  const s = await getSession();
  const res = await setOrderStatus(s, orderId, status);
  revalidatePath(`/projects/${orderId}`);
  revalidatePath("/projects");
  return res;
}

export async function addOrderDocumentAction(orderId: string, doc: { url: string; name: string }) {
  const s = await getSession();
  await addOrderDocument(s, orderId, doc);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function deleteOrderDocumentAction(orderId: string, docId: string) {
  const s = await getSession();
  await deleteOrderDocument(s, docId);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function updateStageAction(orderId: string, stageId: string, data: unknown) {
  const s = await getSession();
  const res = await updateStage(s, stageId, data as Parameters<typeof updateStage>[2]);
  revalidatePath(`/projects/${orderId}`);
  return res;
}

export async function addStagePhotoAction(orderId: string, stageId: string, photo: unknown) {
  const s = await getSession();
  await addStagePhoto(s, stageId, photo as Parameters<typeof addStagePhoto>[2]);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function addDrawingAction(orderId: string, data: unknown) {
  const s = await getSession();
  await addDrawing(s, orderId, data as Parameters<typeof addDrawing>[2]);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function setDrawingApprovalAction(orderId: string, drawingId: string, status: "DRAFT" | "FOR_APPROVAL" | "APPROVED") {
  const s = await getSession();
  await setDrawingApproval(s, drawingId, status);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function addReceiptAction(orderId: string, milestoneId: string, data: unknown) {
  const s = await getSession();
  await addReceipt(s, milestoneId, data as Parameters<typeof addReceipt>[2]);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function setMilestoneScheduleAction(
  orderId: string,
  milestoneId: string,
  data: { dueDate?: string | null; linkedStageId?: string | null },
) {
  const s = await getSession();
  await setMilestoneSchedule(s, milestoneId, {
    dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null,
    linkedStageId: data.linkedStageId,
  });
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function createInvoiceAction(orderId: string, milestoneId: string) {
  const s = await getSession();
  const res = await createInvoiceFromMilestone(s, milestoneId);
  revalidatePath(`/projects/${orderId}`);
  return res;
}

export async function assignTeamAction(orderId: string, userId: string, role: string) {
  const s = await getSession();
  await assignTeam(s, orderId, userId, role);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function setOrderGstAction(orderId: string, data: { clientStateCode?: string; clientGstin?: string }) {
  const s = await getSession();
  await setOrderGst(s, orderId, data);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function removeTeamAction(orderId: string, userId: string) {
  const s = await getSession();
  await removeTeam(s, orderId, userId);
  revalidatePath(`/projects/${orderId}`);
  return { ok: true };
}

export async function logProjectCallAction(orderId: string, body: string) {
  const s = await getSession();
  const comm = await logProjectComm(s, { orderId, channel: "CALL", direction: "OUT", body });
  revalidatePath(`/projects/${orderId}`);
  return { ok: true, id: comm.id };
}

export async function sendProjectWhatsAppAction(orderId: string, body: string) {
  const s = await getSession();
  const res = await sendProjectWhatsApp(s, orderId, body);
  revalidatePath(`/projects/${orderId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function sendProjectEmailAction(orderId: string, subject: string, body: string) {
  const s = await getSession();
  const res = await sendProjectEmail(s, orderId, subject, body);
  revalidatePath(`/projects/${orderId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function archiveOrderAction(orderId: string) {
  const s = await getSession();
  await archiveOrder(s, orderId);
  revalidatePath("/projects");
  redirect("/projects");
}
