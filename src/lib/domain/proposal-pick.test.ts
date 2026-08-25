import { describe, it, expect } from "vitest";
import { primaryProposal, orderedProposals, proposalsWithOrders } from "./proposal-pick";

const p = (status: string, createdAt: string, order: unknown = null) => ({ status, createdAt, order });

describe("primaryProposal", () => {
  it("returns null for a lead that has not been quoted", () => {
    expect(primaryProposal([])).toBeNull();
  });

  it("prefers the WON proposal even when a newer one exists", () => {
    const won = p("WON", "2026-01-01");
    const newerDraft = p("DRAFT", "2026-06-01");
    expect(primaryProposal([newerDraft, won])).toBe(won);
  });

  it("falls back to the most recent when nothing is won", () => {
    const older = p("SENT", "2026-01-01");
    const newer = p("UNDER_NEGOTIATION", "2026-06-01");
    // Deliberately passed oldest-first: the pick must NOT depend on the caller's
    // query order, which is the whole bug this helper exists to prevent.
    expect(primaryProposal([older, newer])).toBe(newer);
  });

  it("does not mutate the input array", () => {
    const list = [p("SENT", "2026-01-01"), p("SENT", "2026-06-01")];
    const snapshot = [...list];
    primaryProposal(list);
    expect(list).toEqual(snapshot);
  });
});

describe("orderedProposals", () => {
  it("sorts newest first regardless of input order", () => {
    const a = p("SENT", "2026-01-01");
    const b = p("SENT", "2026-03-01");
    const c = p("SENT", "2026-02-01");
    expect(orderedProposals([a, b, c])).toEqual([b, c, a]);
  });
});

describe("proposalsWithOrders", () => {
  it("keeps only proposals that became projects", () => {
    const won = p("WON", "2026-01-01", { projectValue: "100" });
    const lost = p("LOST", "2026-02-01");
    expect(proposalsWithOrders([won, lost])).toEqual([won]);
  });

  it("returns BOTH won proposals for a lead quoted twice — the under-count guard", () => {
    // A lead can legitimately win a project proposal AND its AMC proposal. Money
    // aggregates must see both; picking proposals[0] would silently halve the LTV.
    const project = p("WON", "2026-01-01", { projectValue: "700000" });
    const amc = p("WON", "2026-05-01", { projectValue: "90000" });
    const result = proposalsWithOrders([project, amc]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => (r.order as { projectValue: string }).projectValue)).toEqual(["90000", "700000"]);
  });

  it("is empty for a lead whose quotes are all open", () => {
    expect(proposalsWithOrders([p("SENT", "2026-01-01"), p("DRAFT", "2026-02-01")])).toEqual([]);
  });
});
