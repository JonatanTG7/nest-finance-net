import { describe, expect, it } from "vitest";
import {
  dailyChangePct,
  dailyRealizedPnl,
  isFxRateUsable,
  portfolioTotals,
  positionCostBasis,
  positionMarketValue,
  positionWeight,
  realizedPnl,
  toIls,
  totalRealizedPnl,
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
  it("sums realized P&L across sells only", () => {
    expect(
      totalRealizedPnl([
        { kind: "sell", price: 150, prior_avg_price: 100, quantity: 10 },
        { kind: "sell", price: 90, prior_avg_price: 100, quantity: 4 },
        { kind: "buy", price: 200, prior_avg_price: 100, quantity: 5 },
        { kind: "adjust", price: 300, prior_avg_price: 100, quantity: 2 },
        { kind: "sell", price: 300, prior_avg_price: null, quantity: 2 },
      ]),
    ).toBe(460);
    expect(totalRealizedPnl([])).toBe(0);
  });
  it("sums realized P&L for today only (Israel day)", () => {
    const now = new Date("2026-11-25T12:00:00+02:00");
    expect(
      dailyRealizedPnl(
        [
          {
            kind: "sell",
            price: 150,
            prior_avg_price: 100,
            quantity: 10,
            occurred_at: "2026-11-25",
          },
          { kind: "sell", price: 90, prior_avg_price: 100, quantity: 4, occurred_at: "2026-11-24" },
          { kind: "buy", price: 200, prior_avg_price: 100, quantity: 5, occurred_at: "2026-11-25" },
          {
            kind: "sell",
            price: 300,
            prior_avg_price: null,
            quantity: 2,
            occurred_at: "2026-11-25",
          },
          // No date — can't be attributed to a day, so never counted.
          { kind: "sell", price: 200, prior_avg_price: 100, quantity: 1 },
        ],
        now,
      ),
    ).toBe(500);
    expect(dailyRealizedPnl([], now)).toBe(0);
  });
  it("uses the Israel calendar day, not the UTC day", () => {
    // 01:30 in Israel is 23:30 UTC the previous day — still "today" here.
    const now = new Date("2026-11-25T01:30:00+02:00");
    expect(
      dailyRealizedPnl(
        [
          {
            kind: "sell",
            price: 150,
            prior_avg_price: 100,
            quantity: 10,
            occurred_at: "2026-11-25",
          },
        ],
        now,
      ),
    ).toBe(500);
    expect(
      dailyRealizedPnl(
        [
          {
            kind: "sell",
            price: 150,
            prior_avg_price: 100,
            quantity: 10,
            occurred_at: "2026-11-24",
          },
        ],
        now,
      ),
    ).toBe(0);
  });
  it("computes daily change % vs start-of-day value", () => {
    expect(dailyChangePct(49, 38252)).toBeCloseTo((49 / 38203) * 100, 6);
    expect(dailyChangePct(-100, 9900)).toBe(-1);
    expect(dailyChangePct(0, 1000)).toBe(0);
    expect(dailyChangePct(100, 100)).toBeNull();
    expect(dailyChangePct(100, 50)).toBeNull();
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
  it("computes cost basis as quantity x average price", () => {
    expect(positionCostBasis(10, 400)).toBe(4000);
    expect(positionCostBasis(0.5, 123.45)).toBeCloseTo(61.725, 6);
  });
});
