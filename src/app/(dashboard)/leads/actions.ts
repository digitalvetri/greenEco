"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  createLeadSchema,
  updateLeadSchema,
  setLeadStatusSchema,
  createFollowUpSchema,
  updateFollowUpSchema,
} from "@/lib/validation";
import {
  createLead,
  updateLead,
  assignLead,
  setLeadStatus,
  archiveLead,
  allLeadsForExport,
  logCommunication,
  sendLeadWhatsApp,
  sendLeadEmail,
  addLeadDocument,
  deleteLeadDocument,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  bulkAssign,
  bulkSetStatus,
  convertToProposal,
} from "@/server/services/lead";
import { manualStatusSchema } from "@/lib/validation";

export async function createLeadAction(input: unknown) {
  const session = await getSession();
  const parsed = createLeadSchema.parse(input);
  const res = await createLead(session, parsed);
  if ("lead" in res) revalidatePath("/leads");
  return res;
}

export async function updateLeadAction(id: string, input: unknown) {
  const session = await getSession();
  const parsed = updateLeadSchema.parse(input);
  const res = await updateLead(session, id, parsed);
  if ("lead" in res) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
  }
  return res;
}

export async function addFollowUpAction(input: unknown) {
  const session = await getSession();
  const parsed = createFollowUpSchema.parse(input);
  const fu = await addFollowUp(session, parsed);
  if (parsed.leadId) revalidatePath(`/leads/${parsed.leadId}`);
  return { ok: true, id: fu.id };
}

export async function assignLeadAction(leadId: string, userId: string) {
  const session = await getSession();
  const res = await assignLead(session, leadId, userId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return res;
}

export async function setLeadStatusAction(leadId: string, input: unknown) {
  const session = await getSession();
  const parsed = setLeadStatusSchema.parse(input);
  const res = await setLeadStatus(session, leadId, parsed.status, parsed.lostReason);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return res;
}

export async function archiveLeadAction(leadId: string) {
  const session = await getSession();
  const res = await archiveLead(session, leadId);
  revalidatePath("/leads");
  return res;
}

export async function exportAllLeadsAction(filters: {
  status?: string;
  source?: string;
  assignee?: string;
  cold?: boolean;
  search?: string;
}) {
  const session = await getSession();
  return allLeadsForExport(session, {
    status: filters.cold ? undefined : filters.status,
    source: filters.source,
    assignedToId: filters.assignee,
    cold: filters.cold,
    search: filters.search,
  });
}

export async function logCallAction(leadId: string, body: string) {
  const session = await getSession();
  const comm = await logCommunication(session, { leadId, channel: "CALL", direction: "OUT", body });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, id: comm.id };
}

export async function sendWhatsAppAction(leadId: string, body: string) {
  const session = await getSession();
  const res = await sendLeadWhatsApp(session, leadId, body);
  revalidatePath(`/leads/${leadId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function sendEmailAction(leadId: string, subject: string, body: string) {
  const session = await getSession();
  const res = await sendLeadEmail(session, leadId, subject, body);
  revalidatePath(`/leads/${leadId}`);
  return { sent: res.delivery.sent, status: res.comm.sentStatus };
}

export async function updateFollowUpAction(leadId: string, followUpId: string, input: unknown) {
  const session = await getSession();
  const parsed = updateFollowUpSchema.parse(input);
  await updateFollowUp(session, followUpId, parsed);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteFollowUpAction(leadId: string, followUpId: string) {
  const session = await getSession();
  await deleteFollowUp(session, followUpId);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function addLeadDocumentAction(leadId: string, doc: { url: string; name: string }) {
  const session = await getSession();
  await addLeadDocument(session, leadId, doc);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteLeadDocumentAction(leadId: string, docId: string) {
  const session = await getSession();
  await deleteLeadDocument(session, docId);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function bulkAssignAction(leadIds: string[], userId: string) {
  const session = await getSession();
  const res = await bulkAssign(session, leadIds, userId);
  revalidatePath("/leads");
  return res;
}

export async function bulkSetStatusAction(leadIds: string[], status: unknown, lostReason?: string) {
  const session = await getSession();
  const parsed = manualStatusSchema.parse(status);
  const res = await bulkSetStatus(session, leadIds, parsed, lostReason);
  revalidatePath("/leads");
  return res;
}

export async function importLeadsAction(rows: Array<Record<string, unknown>>) {
  const session = await getSession();
  let created = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      const phone = String(r.phone ?? r.Phone ?? r.mobile ?? "").replace(/\D/g, "");
      const parsed = createLeadSchema.parse({
        customerName: String(r.customerName ?? r.CustomerName ?? r.name ?? r.Name ?? ""),
        address: String(r.address ?? r.Address ?? "-"),
        phone,
        email: r.email ? String(r.email) : undefined,
        source: (["Reference", "SiteVisit", "CallIn", "Builder", "Consultant", "Other"].includes(
          String(r.source),
        )
          ? String(r.source)
          : "Other") as never,
        requirement: r.requirement ? String(r.requirement) : undefined,
        overrideDuplicate: true,
      });
      const res = await createLead(session, parsed);
      if ("lead" in res) created++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "row failed");
    }
  }
  revalidatePath("/leads");
  return { created, failed: errors.length };
}

export async function convertLeadAction(leadId: string) {
  const session = await getSession();
  const res = await convertToProposal(session, leadId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/proposals");
  return res;
}
