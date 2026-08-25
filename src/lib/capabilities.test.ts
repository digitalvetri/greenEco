import { describe, it, expect } from "vitest";
import { hasCapability, sanitizeCapabilities, CAPABILITIES, ADMIN_ONLY_KEYS, stripPricing } from "./rbac";

const employee = (capabilities: string[] = []) => ({
  userId: "u1",
  role: "EMPLOYEE" as const,
  companyId: "c1",
  capabilities,
});
const admin = { userId: "u0", role: "ADMIN" as const, companyId: "c1", capabilities: [] };

describe("hasCapability", () => {
  it("grants an admin every capability, even with an empty array", () => {
    // An admin must never be lockable out of their own workspace by a bad edit.
    expect(hasCapability(admin, CAPABILITIES.DRAWINGS)).toBe(true);
  });

  it("denies an employee who wasn't granted it", () => {
    expect(hasCapability(employee(), CAPABILITIES.DRAWINGS)).toBe(false);
  });

  it("grants an employee who was", () => {
    expect(hasCapability(employee(["DRAWINGS"]), CAPABILITIES.DRAWINGS)).toBe(true);
  });

  it("treats a missing capabilities field as no grants, not a crash", () => {
    // Every pre-existing Ctx literal in the codebase omits it.
    expect(hasCapability({ userId: "u", role: "EMPLOYEE", companyId: "c" }, CAPABILITIES.DRAWINGS)).toBe(false);
  });

  it("ignores an unrelated capability", () => {
    expect(hasCapability(employee(["SOMETHING_ELSE"]), CAPABILITIES.DRAWINGS)).toBe(false);
  });
});

describe("sanitizeCapabilities", () => {
  it("keeps only allowlisted values", () => {
    expect(sanitizeCapabilities(["DRAWINGS", "MAKE_ME_ADMIN", ""])).toEqual(["DRAWINGS"]);
  });

  it("de-duplicates", () => {
    expect(sanitizeCapabilities(["DRAWINGS", "DRAWINGS"])).toEqual(["DRAWINGS"]);
  });

  it("returns an empty array for anything that isn't a list", () => {
    for (const junk of [null, undefined, "DRAWINGS", 42, { DRAWINGS: true }]) {
      expect(sanitizeCapabilities(junk)).toEqual([]);
    }
  });

  it("drops non-string members rather than storing them", () => {
    expect(sanitizeCapabilities(["DRAWINGS", 1, null, {}])).toEqual(["DRAWINGS"]);
  });
});

describe("capabilities cannot weaken existing RBAC", () => {
  it("a capability does not unlock admin-only pricing keys", () => {
    // The non-negotiable: capabilities only ever ADD a specific permission. Field
    // stripping is driven by role and must be untouched by any grant.
    const payload = { item: "Pump", purchasePrice: "5000", estimatedCost: "4000", rate: "6000" };
    const stripped = stripPricing(payload, "EMPLOYEE") as Record<string, unknown>;
    expect("purchasePrice" in stripped).toBe(false);
    expect("estimatedCost" in stripped).toBe(false);
    // rate is a SELL price on a BOQ line — employees may see it.
    expect(stripped.rate).toBe("6000");
  });

  it("DRAWINGS is not in the admin-only key set", () => {
    // Sanity: the capability name must never collide with a stripped field name.
    expect(ADMIN_ONLY_KEYS.has("DRAWINGS")).toBe(false);
    expect(ADMIN_ONLY_KEYS.has("capabilities")).toBe(false);
  });
});
