"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { issueDraftInvoice } from "@/server/services/invoice";

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
