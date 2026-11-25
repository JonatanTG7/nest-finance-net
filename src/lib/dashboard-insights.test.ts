import { describe, expect, it } from "vitest";
import { computeQuickInsights } from "./dashboard-insights";
import type { Transaction } from "./db";

function tx(partial: Partial<Transaction>): Transaction {
  return { type: "expense", amount_ils: 0, occurred_at: "2026-11-10", ...partial } as Transaction;
}

describe("dashboard quick insights", () => {
  it("picks the largest single outflow and the average daily outflow", () => {
    const txs = [
      tx({ title: "small", amount_ils: 50, occurred_at: "2026-11-02" }),
      tx({ title: "big", amount_ils: 400, occurred_at: "2026-11-05" }),
      tx({ title: "mid", amount_ils: 150, occurred_at: "2026-11-08" }),
      tx({ type: "income", title: "salary", amount_ils: 10000, occurred_at: "2026-11-01" }),
    ];
    // 30-day period, 10 elapsed days (2026-11-01..2026-11-10), 600 total outflow.
    const r = computeQuickInsights(txs, "2026-11-01", "2026-12-01", "2026-11-11");
    expect(r.largest?.title).toBe("big");
    expect(r.avgDaily).toBe(60);
  });

  it("returns no largest expense and zero average when there is no outflow", () => {
    const txs = [tx({ type: "income", title: "salary", amount_ils: 10000 })];
    const r = computeQuickInsights(txs, "2026-11-01", "2026-12-01", "2026-11-10");
    expect(r.largest).toBeNull();
    expect(r.avgDaily).toBe(0);
  });

  it("never reports a top category — the donut already shows it", () => {
    const txs = [tx({ title: "only", amount_ils: 100 })];
    const r = computeQuickInsights(txs, "2026-11-01", "2026-12-01", "2026-11-10");
    expect(r).not.toHaveProperty("topCategory");
    expect(Object.keys(r).sort()).toEqual(["avgDaily", "largest"]);
  });

  it("counts only elapsed days in the average, never future days", () => {
    const txs = [tx({ amount_ils: 90, occurred_at: "2026-11-02" })];
    // Period is 30 days but only 3 have elapsed → 90 / 3, not 90 / 30.
    const r = computeQuickInsights(txs, "2026-11-01", "2026-12-01", "2026-11-04");
    expect(r.avgDaily).toBe(30);
  });
});
