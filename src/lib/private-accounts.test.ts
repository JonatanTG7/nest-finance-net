import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLORS,
  accountsOfPerson,
  colorAfterKindChange,
  diffPrivateAccountFields,
  filterAccountsByOwner,
  isSharedAccount,
  kindColor,
  kindLabel,
  normalizeColor,
  normalizePrivateMetadata,
  sumPrivateAccountExtras,
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
    expect(isSharedAccount({ person: "person:child-1", kind: "savings" })).toBe(false);
  });
  it("treats IB portfolios by their owner, like any account", () => {
    expect(isSharedAccount({ person: "yonatan", kind: "interactive" })).toBe(false);
    expect(isSharedAccount({ person: "person:child-1", kind: "interactive" })).toBe(false);
    expect(isSharedAccount({ person: "shared", kind: "interactive" })).toBe(true);
  });
});

describe("accountsOfPerson", () => {
  const accounts = [
    { id: "1", person: "yonatan" as const, kind: "pension" },
    { id: "2", person: "shiri" as const, kind: "provident" },
    { id: "3", person: "shared" as const, kind: "savings" },
    { id: "4", person: "yonatan" as const, kind: "interactive" },
    { id: "5", person: "person:child-1" as const, kind: "interactive" },
  ];
  it("returns only that person's accounts, including IB portfolios", () => {
    expect(accountsOfPerson(accounts, "yonatan").map((a) => a.id)).toEqual(["1", "4"]);
    expect(accountsOfPerson(accounts, "shiri").map((a) => a.id)).toEqual(["2"]);
    expect(accountsOfPerson(accounts, "person:child-1").map((a) => a.id)).toEqual(["5"]);
  });
});

describe("filterAccountsByOwner", () => {
  const accounts = [
    { id: "1", person: "yonatan" as const, kind: "pension" },
    { id: "2", person: "shiri" as const, kind: "provident" },
    { id: "3", person: "shared" as const, kind: "savings" },
    { id: "4", person: "person:child-1" as const, kind: "interactive" },
    { id: "5", person: "shared" as const, kind: "interactive" },
  ];
  it("shows shared accounts for 'all' and 'shared'", () => {
    expect(filterAccountsByOwner(accounts, "all").map((a) => a.id)).toEqual(["3", "5"]);
    expect(filterAccountsByOwner(accounts, "shared").map((a) => a.id)).toEqual(["3", "5"]);
  });
  it("shows one person's accounts for a person filter", () => {
    expect(filterAccountsByOwner(accounts, "yonatan").map((a) => a.id)).toEqual(["1"]);
    expect(filterAccountsByOwner(accounts, "person:child-1").map((a) => a.id)).toEqual(["4"]);
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
    color: "#8b5cf6",
    notes: null,
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
  it("reports a color change", () => {
    expect(diffPrivateAccountFields(base, { ...base, color: "#10b981" })).toEqual([
      { field: "color", oldValue: "#8b5cf6", newValue: "#10b981" },
    ]);
  });
  it("reports an owner move", () => {
    expect(diffPrivateAccountFields(base, { ...base, person: "shiri" })).toEqual([
      { field: "owner", oldValue: "yonatan", newValue: "shiri" },
    ]);
  });
  it("reports a move to shared and to an added person", () => {
    expect(diffPrivateAccountFields(base, { ...base, person: "shared" })).toEqual([
      { field: "owner", oldValue: "yonatan", newValue: "shared" },
    ]);
    expect(diffPrivateAccountFields(base, { ...base, person: "person:child-1" })).toEqual([
      { field: "owner", oldValue: "yonatan", newValue: "person:child-1" },
    ]);
  });
  it("does not flag a fee rewritten as the same number", () => {
    expect(diffPrivateAccountFields(base, { ...base, fee_from_balance: 0.1 })).toEqual([]);
  });
  it("never tracks notes changes in the history", () => {
    expect(diffPrivateAccountFields(base, { ...base, notes: "מספר קופה 168" })).toEqual([]);
    expect(diffPrivateAccountFields({ ...base, notes: "ישן" }, { ...base, notes: "חדש" })).toEqual(
      [],
    );
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
        notes: "  מספר קופה 168  ",
      }),
    ).toEqual({
      name: "פנסיה",
      kind: "pension",
      company: null,
      fee_from_balance: null,
      fee_from_deposits: 1.5,
      track: "מניות",
      color: "#8b5cf6",
      notes: "מספר קופה 168",
    });
  });
  it("defaults the color to the kind color when none is picked", () => {
    expect(
      normalizePrivateMetadata({
        name: "x",
        kind: "provident",
        company: "",
        fee_from_balance: "",
        fee_from_deposits: "",
        track: "",
        notes: "",
      }).color,
    ).toBe("#10b981");
  });
  it("keeps a picked palette color and falls back on a bad value", () => {
    const form = {
      name: "x",
      kind: "pension",
      company: "",
      fee_from_balance: "",
      fee_from_deposits: "",
      track: "",
      notes: "",
    };
    expect(normalizePrivateMetadata({ ...form, color: "#EC4899" }).color).toBe("#ec4899");
    expect(normalizePrivateMetadata({ ...form, color: "red" }).color).toBe("#8b5cf6");
    expect(normalizePrivateMetadata({ ...form, color: "" }).color).toBe("#8b5cf6");
  });
  it("turns blank notes into null", () => {
    expect(
      normalizePrivateMetadata({
        name: "x",
        kind: "pension",
        company: "",
        fee_from_balance: "",
        fee_from_deposits: "",
        track: "",
        notes: "   ",
      }).notes,
    ).toBeNull();
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
        notes: "",
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
        notes: "",
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
        notes: "",
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
  it("offers every kind default color in the palette", () => {
    for (const kind of ["pension", "provident", "savings", "investment", "other"]) {
      expect(ACCOUNT_COLORS).toContain(kindColor(kind));
    }
  });
});

describe("normalizeColor", () => {
  it("accepts a #rrggbb hex (lowercased) and rejects the rest", () => {
    expect(normalizeColor("#EC4899", "pension")).toBe("#ec4899");
    expect(normalizeColor("red", "pension")).toBe("#8b5cf6");
    expect(normalizeColor("#12345", "provident")).toBe("#10b981");
    expect(normalizeColor(null, "savings")).toBe("#f59e0b");
    expect(normalizeColor(undefined, "investment")).toBe("#3b82f6");
  });
});

describe("colorAfterKindChange", () => {
  it("follows the new kind default until the user picks a color by hand", () => {
    expect(colorAfterKindChange(null, false, "pension")).toBe("#8b5cf6");
    expect(colorAfterKindChange("#f59e0b", false, "investment")).toBe("#3b82f6");
  });
  it("keeps a hand-picked color when the kind changes", () => {
    expect(colorAfterKindChange("#ec4899", true, "pension")).toBe("#ec4899");
    expect(colorAfterKindChange("#EC4899", true, "provident")).toBe("#ec4899");
  });
  it("falls back to the kind default when a hand-picked color is missing", () => {
    expect(colorAfterKindChange(null, true, "savings")).toBe("#f59e0b");
    expect(colorAfterKindChange(undefined, true, "provident")).toBe("#10b981");
  });
});

describe("sumPrivateAccountExtras", () => {
  const account = (partial: Record<string, number | null>) => ({
    monthly_deposit_employee: null,
    monthly_deposit_employer: null,
    monthly_deposit_severance: null,
    expected_monthly_pension: null,
    ...partial,
  });
  it("sums deposit parts and expected pensions across accounts", () => {
    expect(
      sumPrivateAccountExtras([
        account({
          monthly_deposit_employee: 500,
          monthly_deposit_employer: 700,
          expected_monthly_pension: 4000,
        }),
        account({ monthly_deposit_severance: 300, expected_monthly_pension: 1500 }),
        account({}),
      ]),
    ).toEqual({ monthlyDeposits: 1500, expectedPension: 5500 });
  });
  it("returns null for a total no account has data for", () => {
    expect(sumPrivateAccountExtras([account({}), account({})])).toEqual({
      monthlyDeposits: null,
      expectedPension: null,
    });
    expect(sumPrivateAccountExtras([])).toEqual({
      monthlyDeposits: null,
      expectedPension: null,
    });
  });
});
