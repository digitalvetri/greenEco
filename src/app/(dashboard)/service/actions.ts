"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  createContract,
  completeVisit,
  createTicket,
  updateTicket,
  generateAmcInvoice,
  setContractStatus,
  renewContract,
  logContractComm,
  sendContractWhatsApp,
  sendContractEmail,
} from "@/server/services/amc";

export async function createContractAction(input: unknown) {
  const s = await getSession();
  const i = input as Record<string, unknown>;
  const res = await createContract(s, {
    ...(i as object),
    startDate: new Date(i.startDate as string),
    endDate: new Date(i.endDate as string),
  } as Parameters<typeof createContract>[1]);
  revalidatePath("/service");
  return res;
}

export async function completeVisitAction(contractId: string, visitId: string, data: unknown) {
  const s = await getSession();
  await completeVisit(s, visitId, data as Parameters<typeof completeVisit>[2]);
  revalidatePath(`/service/${contractId}`);
  return { ok: true };
}

export async function createTicketAction(input: unknown) {
  const s = await getSession();
  const res = await createTicket(s, input as Parameters<typeof createTicket>[1]);
  revalidatePath("/service");
  return res;
}

export async function updateTicketAction(id: string, data: unknown) {
  const s = await getSession();
  await updateTicket(s, id, data as Parameters<typeof updateTicket>[2]);
  revalidatePath("/service");
  return { ok: true };
}

export async function setContractStatusAction(contractId: string, status: "ACTIVE" | "CANCELLED") {
  const s = await getSession();
  await setContractStatus(s, contractId, status);
  revalidatePath(`/service/${contractId}`);
  revalidatePath("/service");
  return { ok: true };
}

export async function logContractCallAction(contractId: string, body: string) {
  const s = await getSession();
  const comm = await logContractComm(s, { contractId, channel: "CALL", direction: "OUT", body });
  revalidatePath(`/service/${contractId}`);
  return { ok: true, id: comm.id };
}

export async function sendContractWhatsAppAction(contractId: string, body: string) {
  const s = await getSession();
  const res = await sendContractWhatsApp(s, contractId, body);
  revalidatePath(`/service/${contractId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function sendContractEmailAction(contractId: string, subject: string, body: string) {
  const s = await getSession();
  const res = await sendContractEmail(s, contractId, subject, body);
  revalidatePath(`/service/${contractId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function renewContractAction(contractId: string) {
  const s = await getSession();
  const res = await renewContract(s, contractId);
  revalidatePath("/service");
  revalidatePath(`/service/${contractId}`);
  return res;
}

export async function generateAmcInvoiceAction(contractId: string, periodLabel: string) {
  const s = await getSession();
  const res = await generateAmcInvoice(s, contractId, periodLabel);
  revalidatePath(`/service/${contractId}`);
  return res;
}
