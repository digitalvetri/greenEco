import { describe, it, expect } from "vitest";
import { visibleProposalWhere, visibleProposalFilter, canSeeProposal } from "./proposal-visibility";

const admin = { userId: "u1", role: "ADMIN" as const, companyId: "c1" };
const employee = { userId: "u2", role: "EMPLOYEE" as const, companyId: "c1" };

describe("proposal visibility", () => {
  it("does not constrain an admin", () => {
    expect(visibleProposalWhere(admin)).toEqual({});
    expect(visibleProposalFilter(admin)).toBeUndefined();
  });

  it("hides only DRAFT from an employee", () => {
    expect(visibleProposalWhere(employee)).toEqual({ status: { not: "DRAFT" } });
    expect(visibleProposalFilter(employee)).toEqual({ status: { not: "DRAFT" } });
  });

  it("lets an employee see every confirmed state, including closed ones", () => {
    // An employee chasing a deal needs the lost/expired history too — the gate is
    // "is the office finished with it", not "is it still open".
    for (const status of ["SENT", "UNDER_NEGOTIATION", "WON", "LOST", "EXPIRED"]) {
      expect(canSeeProposal(employee, { status })).toBe(true);
    }
  });

  it("blocks an employee from an unconfirmed draft but not an admin", () => {
    expect(canSeeProposal(employee, { status: "DRAFT" })).toBe(false);
    expect(canSeeProposal(admin, { status: "DRAFT" })).toBe(true);
  });

  it("nested-include filter matches the top-level rule for employees", () => {
    // These two must never drift: the list and a lead's badge strip would then
    // disagree about what an employee is allowed to see.
    expect(visibleProposalFilter(employee)).toEqual(visibleProposalWhere(employee));
  });
});
