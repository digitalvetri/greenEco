import { redirect } from "next/navigation";

/**
 * Proposal requests moved out of the Proposals sub-nav to a top-level Operations
 * module at /proposal-requests. This redirect keeps every already-issued link
 * working — notification deep-links written into AutomationTask rows before the
 * move, plus anyone's bookmark — rather than 404ing them.
 */
export default function LegacyProposalRequestsRedirect() {
  redirect("/proposal-requests");
}
