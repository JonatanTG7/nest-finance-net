import { describe, expect, it } from "vitest";
import { parsePrivacyStored, privacyBlurClass } from "./privacy";

describe("parsePrivacyStored", () => {
  it("defaults to blurred when nothing is stored", () => {
    expect(parsePrivacyStored(null)).toBe(true);
  });

  it("treats only an explicit 0 as revealed", () => {
    expect(parsePrivacyStored("0")).toBe(false);
    expect(parsePrivacyStored("1")).toBe(true);
  });

  it("treats garbage as blurred (fail private)", () => {
    expect(parsePrivacyStored("")).toBe(true);
    expect(parsePrivacyStored("yes")).toBe(true);
  });
});

describe("privacyBlurClass", () => {
  it("blurs and blocks selection when private", () => {
    expect(privacyBlurClass(true)).toContain("blur-md");
    expect(privacyBlurClass(true)).toContain("select-none");
  });

  it("adds nothing when revealed", () => {
    expect(privacyBlurClass(false)).toBe("");
  });
});
