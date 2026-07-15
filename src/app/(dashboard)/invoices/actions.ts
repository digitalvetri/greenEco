"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { issueDraftInvoice, getInvoiceDetail, createStandaloneInvoice, listOrderOptions, type InvoiceDetail } from "@/server/services/invoice";

/** Fetch a single invoice for the in-app slide-in panel (admin). */
export async function getInvoiceDetailAction(id: string): Promise<InvoiceDetail | null> {
  const session = await getSession();
  return getInvoiceDetail(session, id);
}

/** Fetch project options for the new-invoice dialog. */
export async function listOrderOptionsAction(): Promise<{ id: string; orderNo: string; clientName: string }[]> {
  const session = await getSession();
  return listOrderOptions(session);
}

/** Create a standalone DRAFT invoice (not tied to a milestone). Admin. */
export async function createInvoiceAction(input: {
  orderId: string;
  description: string;
  grossAmount: number;
  gstRate: number;
  date: string;
}): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  const session = await getSession();
  try {
    const r = await createStandaloneInvoice(session, {
      orderId: input.orderId,
      description: input.description,
      grossAmount: input.grossAmount,
      gstRate: input.gstRate,
      date: new Date(input.date),
    });
    revalidatePath("/invoices");
    return { ok: true, invoiceId: r.invoiceId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create invoice" };
  }
}

/** Issue an A5 auto-drafted invoice — assigns the real sequential number. Admin. */
export async function issueDraftInvoiceAction(invoiceId: string): Promise<{ ok: boolean; invoiceNo?: string; error?: string }> {
  const session = await getSession();
  try {
    const r = await issueDraftInvoice(session, invoiceId);
    revalidatePath("/invoices");
    return { ok: true, invoiceNo: r.invoiceNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to issue" };
  }
}
