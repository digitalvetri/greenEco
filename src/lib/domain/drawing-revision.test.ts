import { describe, it, expect } from "vitest";
import { nextRevision } from "@/server/services/order";

describe("nextRevision", () => {
  it("walks the alphabet", () => {
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("B")).toBe("C");
    expect(nextRevision("Y")).toBe("Z");
  });

  it("rolls Z over to AA instead of '['", () => {
    // The old implementation was String.fromCharCode(prev.charCodeAt(0) + 1), which
    // turned revision Z into "[" — a nonsense revision letter on an engineering
    // drawing that a customer builds from.
    expect(nextRevision("Z")).toBe("AA");
    expect(nextRevision("AA")).toBe("AB");
    expect(nextRevision("AZ")).toBe("BA");
    expect(nextRevision("ZZ")).toBe("AAA");
  });

  it("never produces a non-letter", () => {
    let rev = "A";
    for (let i = 0; i < 200; i += 1) {
      rev = nextRevision(rev);
      expect(rev).toMatch(/^[A-Z]+$/);
    }
  });

  it("normalises unexpected input rather than corrupting the chain", () => {
    expect(nextRevision("")).toBe("B"); // treated as "A"
    expect(nextRevision("a")).toBe("B");
  });
});
