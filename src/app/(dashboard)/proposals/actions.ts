"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  updateBasics,
  saveVersion,
  generateForProposal,
  approveAndSend,
  markWon,
  markLost,
  setProposalStatus,
  addProposalDocument,
  deleteProposalDocument,
  sendProposalToClient,
} from "@/server/services/proposal";

export async function updateBasicsAction(id: string, data: unknown) {
  const s = await getSession();
  const res = await updateBasics(s, id, data as Parameters<typeof updateBasics>[2]);
  revalidatePath(`/proposals/${id}`);
  return res;
}

export async function saveVersionAction(id: string, input: unknown) {
  const s = await getSession();
  const res = await saveVersion(s, id, input as Parameters<typeof saveVersion>[2]);
  revalidatePath(`/proposals/${id}`);
  return res;
}

export async function generateAction(id: string, input: unknown) {
  const s = await getSession();
  const res = await generateForProposal(s, id, input as Parameters<typeof generateForProposal>[2]);
  revalidatePath(`/proposals/${id}`);
  return res;
}

export async function approveSendAction(id: string, overrideNote?: string) {
  const s = await getSession();
  const res = await approveAndSend(s, id, overrideNote);
  revalidatePath(`/proposals/${id}`);
  return res;
}

export async function wonAction(id: string) {
  const s = await getSession();
  const res = await markWon(s, id);
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/projects");
  return res;
}

export async function lostAction(id: string, reason: string) {
  const s = await getSession();
  const res = await markLost(s, id, reason);
  revalidatePath(`/proposals/${id}`);
  return res;
}

export async function setProposalStatusAction(id: string, status: "SENT" | "UNDER_NEGOTIATION") {
  const s = await getSession();
  const res = await setProposalStatus(s, id, status);
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return res;
}

export async function addProposalDocumentAction(id: string, doc: { url: string; name: string }) {
  const s = await getSession();
  await addProposalDocument(s, id, doc);
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposalDocumentAction(id: string, docId: string) {
  const s = await getSession();
  await deleteProposalDocument(s, docId);
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function sendProposalAction(id: string, channel: "WHATSAPP" | "EMAIL") {
  const s = await getSession();
  const res = await sendProposalToClient(s, id, channel);
  revalidatePath(`/proposals/${id}`);
  return res;
}
