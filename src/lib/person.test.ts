import { describe, expect, it } from "vitest";
import {
  mergeHouseholdPersons,
  personAccentColor,
  resolveOwnerLabel,
  resolvePersonPageTitle,
  type HouseholdPerson,
} from "./person";
import type { HouseholdPersonRow } from "./household-people";

describe("mergeHouseholdPersons", () => {
  const slot = (person: string, label: string): HouseholdPerson => ({
    person,
    label,
    avatarUrl: null,
  });
  const added = (id: string, name: string, sort_order: number): HouseholdPersonRow => ({
    id,
    household_id: "h1",
    name,
    sort_order,
    created_at: "2026-11-23T00:00:00Z",
  });

  it("returns slots first in slot order, then added people by sort order", () => {
    expect(
      mergeHouseholdPersons(
        [slot("shiri", "Shiri"), slot("yonatan", "Jonatan")],
        [added("c2", "Second", 2), added("c1", "First", 1)],
      ).map((p) => p.person),
    ).toEqual(["yonatan", "shiri", "person:c1", "person:c2"]);
  });
  it("keeps added people's names whole (no first-name splitting)", () => {
    const [p] = mergeHouseholdPersons([], [added("c1", "Eitan Gelershtein", 0)]);
    expect(p.label).toBe("Eitan Gelershtein");
    expect(p.avatarUrl).toBeNull();
  });
  it("handles a household with only added people, or only slots", () => {
    expect(mergeHouseholdPersons([], [added("c1", "Kid", 0)]).map((p) => p.person)).toEqual([
      "person:c1",
    ]);
    expect(mergeHouseholdPersons([slot("yonatan", "Jonatan")], []).map((p) => p.person)).toEqual([
      "yonatan",
    ]);
    expect(mergeHouseholdPersons([], [])).toEqual([]);
  });
  it("drops duplicate slots and unknown slot values", () => {
    expect(
      mergeHouseholdPersons(
        [slot("yonatan", "Jonatan"), slot("yonatan", "Jonatan 2"), slot("shared", "Shared")],
        [],
      ).map((p) => p.person),
    ).toEqual(["yonatan"]);
  });
});

describe("resolveOwnerLabel", () => {
  const labels = { yonatan: "Jonatan", shiri: "Shiri", shared: "Shared", "person:c1": "Eitan" };

  it("returns the label for a known owner", () => {
    expect(resolveOwnerLabel(labels, "yonatan")).toBe("Jonatan");
    expect(resolveOwnerLabel(labels, "person:c1")).toBe("Eitan");
  });
  it("falls back to the shared label for a null owner", () => {
    expect(resolveOwnerLabel(labels, null)).toBe("Shared");
    expect(resolveOwnerLabel(labels, undefined)).toBe("Shared");
  });
  it("never renders a dash for an unknown or not-yet-loaded owner id", () => {
    expect(resolveOwnerLabel(labels, "person:gone")).toBe("Shared");
    expect(resolveOwnerLabel({}, "yonatan")).toBe("Shared");
  });
});

describe("personAccentColor", () => {
  it("cycles through the palette by position", () => {
    expect(personAccentColor(0)).toBe("#8b5cf6");
    expect(personAccentColor(1)).toBe("#0891b2");
    // Five colors: index 5 wraps back to the first.
    expect(personAccentColor(5)).toBe(personAccentColor(0));
    expect(personAccentColor(6)).toBe(personAccentColor(1));
  });
});

describe("resolvePersonPageTitle", () => {
  it("uses the person's name when known", () => {
    expect(resolvePersonPageTitle("יונתן")).toBe("יונתן");
    expect(resolvePersonPageTitle("Shiri")).toBe("Shiri");
  });
  it("falls back to the generic label when the person is unknown", () => {
    expect(resolvePersonPageTitle(null)).toBe("חשבונות פרטיים");
    expect(resolvePersonPageTitle(undefined)).toBe("חשבונות פרטיים");
    expect(resolvePersonPageTitle("   ")).toBe("חשבונות פרטיים");
  });
});
