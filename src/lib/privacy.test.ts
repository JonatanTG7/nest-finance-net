import { describe, expect, it } from "vitest";
import { maskAmountText, parsePrivacyStored, PRIVACY_MASK } from "./privacy";

describe("parsePrivacyStored", () => {
  it("defaults to hidden when nothing is stored", () => {
    expect(parsePrivacyStored(null)).toBe(true);
  });

  it("treats only an explicit 0 as revealed", () => {
    expect(parsePrivacyStored("0")).toBe(false);
    expect(parsePrivacyStored("1")).toBe(true);
  });

  it("treats garbage as hidden (fail private)", () => {
    expect(parsePrivacyStored("")).toBe(true);
    expect(parsePrivacyStored("yes")).toBe(true);
  });
});

describe("maskAmountText", () => {
  it("passes the text through unchanged when revealed", () => {
    expect(maskAmountText("₪ 124,075", false)).toBe("₪ 124,075");
    expect(maskAmountText("$38,306.66", false)).toBe("$38,306.66");
  });

  it("masks digits with a fixed mask, keeping the currency symbol", () => {
    expect(maskAmountText("₪ 124,075", true)).toBe("₪ ****");
    expect(maskAmountText("$38,306.66", true)).toBe("$****");
    // formatMoney wraps amounts with an LRM so they stay LTR in RTL text.
    expect(maskAmountText("\u200E124,075 ₪", true)).toBe(`\u200E${PRIVACY_MASK} ₪`);
  });

  it("masks plain numbers and percentages without leaking magnitude", () => {
    expect(maskAmountText("38,306", true)).toBe("****");
    expect(maskAmountText("3.25%", true)).toBe("****%");
    expect(maskAmountText("16.9526", true)).toBe("****");
    // A huge value and a tiny one mask identically.
    expect(maskAmountText("1,234,567.89", true)).toBe(maskAmountText("0.01", true));
  });

  it("masks every amount in a multi-amount string", () => {
    expect(maskAmountText("₪ 1,000 → ₪ 2,000", true)).toBe("₪ **** → ₪ ****");
  });

  it("leaves digit-free strings untouched", () => {
    expect(maskAmountText("—", true)).toBe("—");
    expect(maskAmountText("", true)).toBe("");
  });
});
