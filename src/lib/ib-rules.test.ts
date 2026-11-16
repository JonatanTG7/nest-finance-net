import { describe, expect, it } from "vitest";
import {
  isFxRateUsable,
  portfolioTotals,
  positionMarketValue,
  positionWeight,
  realizedPnl,
  toIls,
  unrealizedPct,
  unrealizedPnl,
  weightedAvg,
} from "./ib-rules";

describe("IB portfolio rules", () => {
  it("computes the weighted average cost basis", () => {
    expect(weightedAvg(10, 100, 10, 200)).toBe(150);
    expect(weightedAvg(0, 0, 5, 123.45)).toBe(123.45);
    expect(weightedAvg(2.5, 400, 2.5, 500)).toBe(450);
  });
  it("rejects invalid weighted-average inputs", () => {
    expect(() => weightedAvg(-1, 100, 1, 100)).toThrow();
    expect(() => weightedAvg(1, 100, 0, 100)).toThrow();
    expect(() => weightedAvg(1, 100, 1, -5)).toThrow();
  });
  it("computes realized P&L on sells", () => {
    expect(realizedPnl(150, 100, 10)).toBe(500);
    expect(realizedPnl(90, 100, 4)).toBe(-40);
  });
  it("falls back to cost basis for market value without a live price", () => {
    expect(positionMarketValue(10, null, 120)).toBe(1200);
    expect(positionMarketValue(10, 130, 120)).toBe(1300);
  });
  it("reports unrealized P&L as unknown (not zero) without a live price", () => {
    expect(unrealizedPnl(null, 120, 10)).toBeNull();
    expect(unrealizedPnl(130, 120, 10)).toBe(100);
    expect(unrealizedPct(null, 120)).toBeNull();
    expect(unrealizedPct(130, 0)).toBeNull();
    expect(unrealizedPct(130, 100)).toBe(30);
  });
  it("never treats a missing or invalid FX rate as a number", () => {
    expect(toIls(100, null)).toBeNull();
    expect(toIls(100, undefined)).toBeNull();
    expect(toIls(100, 0)).toBeNull();
    expect(toIls(100, -3)).toBeNull();
    expect(toIls(100, NaN)).toBeNull();
    expect(toIls(100, 3.5)).toBe(350);
    expect(isFxRateUsable(3.5)).toBe(true);
    expect(isFxRateUsable(0)).toBe(false);
  });
  it("sums portfolio totals and flags partial unrealized P&L", () => {
    const t = portfolioTotals([
      { marketValue: 1000, unrealized: 50, dailyChangeAbs: 10 },
      { marketValue: 500, unrealized: null, dailyChangeAbs: null },
    ]);
    expect(t.marketValue).toBe(1500);
    expect(t.unrealized).toBe(50);
    expect(t.unrealizedKnown).toBe(false);
    expect(t.dailyChange).toBe(10);
    expect(portfolioTotals([])).toEqual({
      marketValue: 0,
      unrealized: 0,
      unrealizedKnown: true,
      dailyChange: 0,
    });
  });
  it("computes position weights", () => {
    expect(positionWeight(250, 1000)).toBe(25);
    expect(positionWeight(100, 0)).toBeNull();
  });
});
