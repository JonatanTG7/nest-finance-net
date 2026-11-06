import { describe, expect, it } from "vitest";
import { tripSpendingInCurrency } from "./trip-currency-rules";

describe("trip cards preserve recorded home currency", () => {
  it("shows Italy's recorded euro amount without converting its ILS value", () => {
    expect(tripSpendingInCurrency([{ amount: 2310.85, currency: "EUR", amount_ils: 8204 }], "EUR", 4.5)).toBe(2310.85);
  });
  it("shows the wedding's recorded euro amount without requiring a current rate", () => {
    expect(tripSpendingInCurrency([{ amount: 3534.03, currency: "EUR", amount_ils: 12517 }], "EUR")).toBe(3534.03);
  });
  it("keeps shekel trips in shekels", () => {
    expect(tripSpendingInCurrency([{ amount: 947, currency: "ILS", amount_ils: 947 }], "ILS")).toBe(947);
  });
});