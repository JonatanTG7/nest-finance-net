import { describe, expect, it } from "vitest";
import { amountInRange, budgetProgress, categorySpent, convertedSubscriptionTotals } from "./finance-rules";

describe("household finance rules", () => {
  it("converts USD subscriptions to ILS before summing", () => {
    expect(convertedSubscriptionTotals([{ amount: 15, currency: "USD", charged: true }, { amount: 100, currency: "ILS", charged: false }], { USD: 3.7 })).toEqual({ total: 155.5, charged: 55.5, pending: 100 });
  });
  it("never treats a missing foreign exchange rate as ILS", () => {
    expect(() => convertedSubscriptionTotals([{ amount: 15, currency: "USD", charged: false }], {})).toThrow();
  });
  it("filters by inclusive ILS amounts", () => {
    expect([499, 500, 800, 801].filter((n) => amountInRange(n, "500", "800"))).toEqual([500, 800]);
  });
  it("warns at 80% and flags budget exhaustion", () => {
    expect(budgetProgress(799, 1000).state).toBe("ok");
    expect(budgetProgress(800, 1000).state).toBe("near");
    expect(budgetProgress(1050, 1000)).toEqual({ percent: 105, state: "over", remaining: -50 });
  });
  it("counts only actual expense and fixed rows in the budget category", () => {
    const rows = [{ category_id: "groceries", type: "expense", amount_ils: 100, occurred_at: "2026-10-18" }, { category_id: "groceries", type: "fixed", amount_ils: 50, occurred_at: "2026-10-10" }, { category_id: "groceries", type: "expense", amount_ils: 200, occurred_at: "2026-10-20" }, { category_id: "groceries", type: "income", amount_ils: 1000, occurred_at: "2026-10-10" }, { category_id: "other", type: "expense", amount_ils: 900, occurred_at: "2026-10-10" }];
    expect(categorySpent(rows, "groceries", "2026-10-18")).toBe(150);
  });
});