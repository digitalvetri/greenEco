import { api, jsonBody } from "@/lib/api";
import { createFollowUpSchema } from "@/lib/validation";
import { addFollowUp } from "@/server/services/lead";
import { addProposalFollowUp } from "@/server/services/proposal";

/** REST endpoint for follow-ups — the offline queue replays here when back online.
 *  Dispatches on which id is present (schema requires exactly one of the two). */
export const POST = api(async (session, req) => {
  const input = createFollowUpSchema.parse(await jsonBody(req));
  const fu = input.leadId
    ? await addFollowUp(session, input)
    : await addProposalFollowUp(session, input.proposalId!, input);
  return { ok: true, id: fu.id };
});
