/**
 * Picking "the" proposal for a lead, now that a lead carries MANY proposals
 * (one per proposal type — a Project Proposal *and* a BOQ *and* an AMC proposal
 * for the same site). Pure + unit-tested.
 *
 * ## Why this exists
 *
 * `Proposal.leadId` used to be `@unique`, so `lead.proposal` was a single row and
 * every display surface just read `.number` / `.status` off it. After the 1:many
 * change the naive port is `lead.proposals[0]` — which is an ARBITRARY proposal
 * (Prisma gives no ordering guarantee without an explicit `orderBy`) and silently
 * changes as rows are added. This makes that choice explicit and consistent.
 *
 * ## The two rules
 *
 * 1. **Display surfaces** (badges, list rows, the client-360 header) use
 *    `primaryProposal()` — the won one, else the most recent.
 * 2. **Money and project counts NEVER use this.** They must iterate every proposal,
 *    because a lead can legitimately have two won proposals (e.g. a project *and*
 *    an AMC), each with its own Order. Use `orderedProposals()` for that.
 *    `Order.proposalId` is still `@unique`, so summing per-proposal cannot
 *    double-count a single order.
 */

/** Minimum shape needed to pick — deliberately requires `createdAt` so the choice
 *  is self-contained and does not silently depend on the caller's `orderBy`. */
export interface PickableProposal {
  status: string;
  createdAt: Date | string;
}

function newestFirst<T extends PickableProposal>(a: T, b: T): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * The proposal that represents this lead on a display surface: the WON one if
 * there is one, otherwise the most recently created. Returns null for a lead with
 * no proposals yet (an enquiry that hasn't been quoted).
 */
export function primaryProposal<T extends PickableProposal>(proposals: T[]): T | null {
  if (proposals.length === 0) return null;
  return proposals.find((p) => p.status === "WON") ?? [...proposals].sort(newestFirst)[0];
}

/** All of a lead's proposals, newest first — the iteration order for money/counts. */
export function orderedProposals<T extends PickableProposal>(proposals: T[]): T[] {
  return [...proposals].sort(newestFirst);
}

/**
 * Every proposal of this lead that actually became a project. One order per
 * proposal (`Order.proposalId @unique`), so this is the correct unit for
 * lifetime value, project counts and per-project export rows.
 */
export function proposalsWithOrders<T extends PickableProposal & { order: unknown | null }>(
  proposals: T[],
): (T & { order: NonNullable<T["order"]> })[] {
  return orderedProposals(proposals).filter(
    (p): p is T & { order: NonNullable<T["order"]> } => p.order != null,
  );
}

/**
 * What one won proposal was actually worth, whichever module it landed in.
 *
 * A win no longer always produces an Order: an AMC Proposal produces a ServiceContract
 * and a Service Proposal produces a ServiceTicket. Counting only orders would report a
 * customer with a ₹5L plant and a ₹1L annual AMC as worth ₹5L.
 *
 * Exactly one of the three is ever set (each link is `@unique` on the proposal), so
 * these can't double-count. Returns 0 for a proposal that hasn't been won.
 *
 * ⚠️ These are WON values, not invoiced ones. Receivables, GST and collection figures
 * read Invoices and are deliberately untouched by this — conflating "sold" with
 * "billed" would corrupt numbers used for tax filing.
 */
export interface RealisedProposal {
  order?: { projectValue: unknown } | null;
  contract?: { annualValue: unknown } | null;
  ticket?: { value: unknown } | null;
}

export function realisedValue(p: RealisedProposal): number {
  const raw = p.order?.projectValue ?? p.contract?.annualValue ?? p.ticket?.value ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Won proposals that produced something with a value — an order, a contract or a job. */
export function realisedProposals<T extends PickableProposal & RealisedProposal>(proposals: T[]): T[] {
  return orderedProposals(proposals).filter((p) => p.order != null || p.contract != null || p.ticket != null);
}
