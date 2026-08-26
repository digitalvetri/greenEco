"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  createProposalRequest,
  reviewProposalRequest,
  type CreateProposalRequestInput,
} from "@/server/services/proposal-request";
import { convertToProposal } from "@/server/services/lead";

export async function createProposalRequestAction(input: CreateProposalRequestInput) {
  const session = await getSession();
  const req = await createProposalRequest(session, input);
  revalidatePath("/proposals/requests");
  revalidatePath(`/leads/${input.leadId}`);
  return { id: req.id };
}

export async function reviewProposalRequestAction(
  id: string,
  status: "ACCEPTED" | "REJECTED",
  rejectionReason?: string,
) {
  const session = await getSession();
  await reviewProposalRequest(session, id, status, rejectionReason);
  revalidatePath("/proposals/requests");
  return { ok: true };
}

/**
 * Admin turns a request into a real proposal. Goes through the same
 * `convertToProposal` the lead-detail Convert button uses — one write path, so the
 * request queue can never create a proposal that differs from a directly-created
 * one. Passing `requestId` marks the request FULFILLED inside that transaction.
 */
export async function createProposalFromRequestAction(
  requestId: string,
  leadId: string,
  proposalType: string,
  technology?: string,
  plantType?: string,
) {
  const session = await getSession();
  const res = await convertToProposal(session, leadId, { proposalType, technology, plantType, requestId });
  revalidatePath("/proposals/requests");
  revalidatePath("/proposals");
  revalidatePath(`/leads/${leadId}`);
  return res;
}
