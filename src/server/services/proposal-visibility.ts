import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/rbac";

/**
 * PROPOSAL VISIBILITY — "an employee sees a proposal only once the admin confirms it".
 *
 * Proposals are written by the office. While one is being drafted it is half-formed
 * work-in-progress with placeholder pricing, and the client's requirement is that it
 * stays inside the office until it's finished.
 *
 * "Confirmed" deliberately reuses the gate that already exists rather than inventing a
 * second state machine: **`status !== "DRAFT"`**. A proposal leaves DRAFT exactly when
 * an admin runs Approve & Send, which already means "this document is finished". Every
 * later state (SENT / UNDER_NEGOTIATION / WON / LOST / EXPIRED) is post-confirmation
 * and stays visible — an employee following up a deal needs to see a lost quote too.
 *
 * This lives in its own module so `proposal.ts`, `lead.ts`, `client.ts` and `search.ts`
 * all gate on the SAME predicate. Adding a new read surface for proposals means adding
 * this to it — that is the whole point of it being one exported function.
 *
 * Enforced in the SERVICE RETURN PATH (house rule, spec §6), never in the UI.
 */

/** `where` fragment for a top-level Proposal query. Empty object for an admin. */
export function visibleProposalWhere(ctx: Ctx): Prisma.ProposalWhereInput {
  return ctx.role === "ADMIN" ? {} : { status: { not: "DRAFT" } };
}

/**
 * Same rule for a *nested* `proposals` include (a lead's quotes on the lead detail,
 * the client 360, the export). Prisma wants `undefined` rather than `{}` here so the
 * admin case adds no filter at all.
 */
export function visibleProposalFilter(ctx: Ctx): Prisma.ProposalWhereInput | undefined {
  return ctx.role === "ADMIN" ? undefined : { status: { not: "DRAFT" } };
}

/** Point check for a single already-loaded proposal (getProposal, print routes). */
export function canSeeProposal(ctx: Ctx, proposal: { status: string }): boolean {
  return ctx.role === "ADMIN" || proposal.status !== "DRAFT";
}
