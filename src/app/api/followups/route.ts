import { api, jsonBody } from "@/lib/api";
import { createFollowUpSchema } from "@/lib/validation";
import { addFollowUp } from "@/server/services/lead";

/** REST endpoint for follow-ups — the offline queue replays here when back online. */
export const POST = api(async (session, req) => {
  const input = createFollowUpSchema.parse(await jsonBody(req));
  const fu = await addFollowUp(session, input);
  return { ok: true, id: fu.id };
});
