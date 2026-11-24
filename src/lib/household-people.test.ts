import { describe, expect, it } from "vitest";
import { addedPersonIdOf, isAddedPersonOwner, ownerIdForAddedPerson } from "./household-people";

describe("added-person owner ids", () => {
  it("encodes a person id as person:<id>", () => {
    expect(ownerIdForAddedPerson("abc-123")).toBe("person:abc-123");
  });
  it("decodes the person id back, and returns null for slot owners", () => {
    expect(addedPersonIdOf("person:abc-123")).toBe("abc-123");
    expect(addedPersonIdOf("yonatan")).toBeNull();
    expect(addedPersonIdOf("shiri")).toBeNull();
    expect(addedPersonIdOf("shared")).toBeNull();
    expect(addedPersonIdOf(null)).toBeNull();
    expect(addedPersonIdOf(undefined)).toBeNull();
    expect(addedPersonIdOf("person:")).toBeNull();
  });
  it("round-trips encode/decode", () => {
    expect(addedPersonIdOf(ownerIdForAddedPerson("x"))).toBe("x");
  });
  it("detects added-person owners", () => {
    expect(isAddedPersonOwner("person:abc-123")).toBe(true);
    expect(isAddedPersonOwner("yonatan")).toBe(false);
    expect(isAddedPersonOwner("shared")).toBe(false);
    expect(isAddedPersonOwner(null)).toBe(false);
  });
});
