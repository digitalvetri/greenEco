/**
 * Proposal expiry (spec §7.2) — derived from the current version's age vs its
 * validityDays, only while the quote is live (SENT / UNDER_NEGOTIATION). Pure +
 * unit-tested. Surfaces the `EXPIRED` state the enum defined but no code set.
 */
export type ProposalExpiry = { state: "active" | "expiring" | "expired"; daysLeft: number } | null;

const LIVE = ["SENT", "UNDER_NEGOTIATION"];

export function proposalExpiry(input: {
  status: string;
  versionCreatedAt: Date | string;
  validityDays: number;
}): ProposalExpiry {
  if (!LIVE.includes(input.status)) return null;
  const created = new Date(input.versionCreatedAt).getTime();
  const expiresAt = created + (input.validityDays || 30) * 86_400_000;
  const daysLeft = Math.ceil((expiresAt - Date.now()) / 86_400_000);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= 7) return { state: "expiring", daysLeft };
  return { state: "active", daysLeft };
}
