"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  createItem,
  createVendor,
  createPO,
  setPOStatus,
  receiveGRN,
  transferStock,
  consumeStock,
  createMaterialRequest,
  setRequestStatus,
  stockAudit,
} from "@/server/services/materials";

export async function createItemAction(data: unknown) {
  const s = await getSession();
  await createItem(s, data as Parameters<typeof createItem>[1]);
  revalidatePath("/materials");
  return { ok: true };
}

export async function createVendorAction(data: unknown) {
  const s = await getSession();
  await createVendor(s, data as Parameters<typeof createVendor>[1]);
  revalidatePath("/materials");
  return { ok: true };
}

export async function createPOAction(data: unknown) {
  const s = await getSession();
  const res = await createPO(s, data as Parameters<typeof createPO>[1]);
  revalidatePath("/materials");
  return res;
}

export async function setPOStatusAction(poId: string, status: "SENT" | "CLOSED") {
  const s = await getSession();
  await setPOStatus(s, poId, status);
  revalidatePath("/materials");
  return { ok: true };
}

export async function receiveGRNAction(poId: string, items: unknown, challanUrl?: string) {
  const s = await getSession();
  await receiveGRN(s, poId, items as Parameters<typeof receiveGRN>[2], challanUrl);
  revalidatePath("/materials");
  return { ok: true };
}

export async function transferAction(data: unknown) {
  const s = await getSession();
  await transferStock(s, data as Parameters<typeof transferStock>[1]);
  revalidatePath("/materials");
  return { ok: true };
}

export async function consumeAction(data: unknown) {
  const s = await getSession();
  await consumeStock(s, data as Parameters<typeof consumeStock>[1]);
  revalidatePath("/materials");
  return { ok: true };
}

export async function materialRequestAction(orderId: string, items: unknown) {
  const s = await getSession();
  await createMaterialRequest(s, orderId, items as { itemId: string; qty: number }[]);
  revalidatePath("/materials");
  return { ok: true };
}

export async function setRequestStatusAction(
  requestId: string,
  status: "PENDING" | "CONVERTED_PO" | "TRANSFERRED" | "REJECTED",
) {
  const s = await getSession();
  await setRequestStatus(s, requestId, status);
  revalidatePath("/materials");
  return { ok: true };
}

export async function stockAuditAction(locationId: string, counts: unknown) {
  const s = await getSession();
  await stockAudit(s, locationId, counts as Parameters<typeof stockAudit>[2]);
  revalidatePath("/materials");
  return { ok: true };
}
