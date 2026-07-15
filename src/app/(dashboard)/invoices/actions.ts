"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { issueDraftInvoice, getInvoiceDetail, type InvoiceDetail } from "@/server/services/invoice";

/** Fetch a single invoice for the in-app slide-in panel (admin). */
export async function getInvoiceDetailAction(id: string): Promise<InvoiceDetail | null> {
  const session = await getSession();
  return getInvoiceDetail(session, id);
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
