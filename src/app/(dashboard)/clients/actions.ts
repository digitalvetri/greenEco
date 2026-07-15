"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateLeadSchema } from "@/lib/validation";
import { updateLead, addLeadContact, deleteLeadContact } from "@/server/services/lead";

/**
 * Edit a client's core details from the Client 360 screen. A "client" is the origin
 * lead, so this reuses updateLead (RBAC-scoped to admin/owner, audited). Only the
 * identity fields are editable here; sizing/requirement stay on the lead screen.
 */
export async function updateClientAction(leadId: string, input: unknown) {
  const session = await getSession();
  const parsed = updateLeadSchema.parse(input);
  const res = await updateLead(session, leadId, parsed);
  if ("duplicate" in res && res.duplicate) return res;
  revalidatePath(`/clients/${leadId}`);
  return res;
}

export async function addClientContactAction(
  leadId: string,
  data: { name: string; designation?: string; mobile: string },
) {
  const session = await getSession();
  try {
    await addLeadContact(session, leadId, data);
    revalidatePath(`/clients/${leadId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to add contact" };
  }
}

export async function deleteClientContactAction(leadId: string, contactId: string) {
  const session = await getSession();
  try {
    await deleteLeadContact(session, contactId);
    revalidatePath(`/clients/${leadId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to remove contact" };
  }
}
