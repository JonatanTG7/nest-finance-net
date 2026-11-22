import { describe, expect, it } from "vitest";
import {
  accountsOfPerson,
  diffPrivateAccountFields,
  isSharedAccount,
  kindColor,
  kindLabel,
  normalizePrivateMetadata,
  type PrivateMetadata,
} from "./private-accounts";

describe("isSharedAccount", () => {
  it("treats shared owners as shared", () => {
    expect(isSharedAccount({ person: "shared", kind: "savings" })).toBe(true);
  });
  it("treats a missing owner as shared (pre-migration rows)", () => {
    expect(isSharedAccount({ kind: "savings" })).toBe(true);
    expect(isSharedAccount({ person: null, kind: "savings" })).toBe(true);
  });
  it("treats a person owner as private", () => {
    expect(isSharedAccount({ person: "yonatan", kind: "pension" })).toBe(false);
    expect(isSharedAccount({ person: "shiri", kind: "provident" })).toBe(false);
  });
  it("treats IB portfolios as shared whatever the owner says", () => {
    expect(isSharedAccount({ person: "yonatan", kind: "interactive" })).toBe(true);
  });
});

describe("accountsOfPerson", () => {
  const accounts = [
    { id: "1", person: "yonatan" as const, kind: "pension" },
    { id: "2", person: "shiri" as const, kind: "provident" },
    { id: "3", person: "shared" as const, kind: "savings" },
    { id: "4", person: "yonatan" as const, kind: "interactive" },
  ];
  it("returns only that person's non-IB accounts", () => {
    expect(accountsOfPerson(accounts, "yonatan").map((a) => a.id)).toEqual(["1"]);
    expect(accountsOfPerson(accounts, "shiri").map((a) => a.id)).toEqual(["2"]);
  });
});

describe("diffPrivateAccountFields", () => {
  const base: PrivateMetadata = {
    name: "פנסיה מנורה",
    kind: "pension",
    company: "מנורה",
    fee_from_balance: 0.1,
    fee_from_deposits: 1.5,
    track: "מניות",
    person: "yonatan",
  };
  it("returns no changes for identical metadata", () => {
    expect(diffPrivateAccountFields(base, { ...base })).toEqual([]);
  });
  it("reports each changed field once", () => {
    const changes = diffPrivateAccountFields(base, {
      ...base,
      company: "כלל",
      fee_from_balance: 0.05,
      track: "S&P 500",
    });
    expect(changes).toEqual([
      { field: "company", oldValue: "מנורה", newValue: "כלל" },
      { field: "fee_from_balance", oldValue: "0.1", newValue: "0.05" },
      { field: "track", oldValue: "מניות", newValue: "S&P 500" },
    ]);
  });
  it("treats empty text and null as the same (not set)", () => {
    expect(
      diffPrivateAccountFields({ ...base, company: null }, { ...base, company: "  " }),
    ).toEqual([]);
  });
  it("reports clearing a field as a change to null", () => {
    expect(diffPrivateAccountFields(base, { ...base, track: null })).toEqual([
      { field: "track", oldValue: "מניות", newValue: null },
    ]);
  });
  it("reports an owner move", () => {
    expect(diffPrivateAccountFields(base, { ...base, person: "shiri" })).toEqual([
      { field: "owner", oldValue: "yonatan", newValue: "shiri" },
    ]);
  });
  it("does not flag a fee rewritten as the same number", () => {
    expect(diffPrivateAccountFields(base, { ...base, fee_from_balance: 0.1 })).toEqual([]);
  });
});

describe("normalizePrivateMetadata", () => {
  it("trims text and turns empty values into null", () => {
    expect(
      normalizePrivateMetadata({
        name: "  פנסיה  ",
        kind: "pension",
        company: " ",
        fee_from_balance: "",
        fee_from_deposits: "1.5",
        track: " מניות ",
      }),
    ).toEqual({
      name: "פנסיה",
      kind: "pension",
      company: null,
      fee_from_balance: null,
      fee_from_deposits: 1.5,
      track: "מניות",
    });
  });
  it("throws on a missing name", () => {
    expect(() =>
      normalizePrivateMetadata({
        name: "   ",
        kind: "pension",
        company: "",
        fee_from_balance: "",
        fee_from_deposits: "",
        track: "",
      }),
    ).toThrow();
  });
  it("throws on an out-of-range fee", () => {
    expect(() =>
      normalizePrivateMetadata({
        name: "x",
        kind: "pension",
        company: "",
        fee_from_balance: "101",
        fee_from_deposits: "",
        track: "",
      }),
    ).toThrow();
    expect(() =>
      normalizePrivateMetadata({
        name: "x",
        kind: "pension",
        company: "",
        fee_from_balance: "-1",
        fee_from_deposits: "",
        track: "",
      }),
    ).toThrow();
  });
});

describe("kind labels and colors", () => {
  it("labels known kinds and falls back to the raw kind", () => {
    expect(kindLabel("pension")).toBe("קרן פנסיה");
    expect(kindLabel("provident")).toBe("קופת גמל / השתלמות");
    expect(kindLabel("mystery")).toBe("mystery");
  });
  it("colors known kinds and falls back to a neutral color", () => {
    expect(kindColor("pension")).toBe("#8b5cf6");
    expect(kindColor("mystery")).toBe("#64748b");
  });
});
