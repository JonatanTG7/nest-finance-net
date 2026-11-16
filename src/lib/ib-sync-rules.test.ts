import { describe, expect, it } from "vitest";
import { checkSyncTotals, parseIbPortfolioScan, planSyncOps } from "./ib-sync-rules";

describe("IB screenshot sync rules", () => {
  it("buys the missing shares of an existing position", () => {
    const plan = planSyncOps(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400 }],
      [{ symbol: "IVV", quantity: 12, avgPrice: 410, marketValue: 5000 }],
    );
    expect(plan.ops).toContainEqual({ symbol: "IVV", action: "buy", quantity: 2, price: 410 });
    expect(plan.hasChanges).toBe(true);
  });
  it("creates a buy op for a brand-new position", () => {
    const plan = planSyncOps(
      [],
      [{ symbol: "QQQ", quantity: 5, avgPrice: 500, marketValue: 2600 }],
    );
    expect(plan.ops).toEqual([{ symbol: "QQQ", action: "buy", quantity: 5, price: 500 }]);
  });
  it("sells the excess at the OLD average so sync never invents P&L", () => {
    const plan = planSyncOps(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400 }],
      [{ symbol: "IVV", quantity: 7, avgPrice: 450, marketValue: 3200 }],
    );
    expect(plan.ops).toContainEqual({ symbol: "IVV", action: "sell", quantity: 3, price: 400 });
  });
  it("adjusts the average cost when only the cost basis differs", () => {
    const plan = planSyncOps(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400 }],
      [{ symbol: "IVV", quantity: 10, avgPrice: 420, marketValue: 4300 }],
    );
    expect(plan.ops).toEqual([{ symbol: "IVV", action: "adjust", quantity: 10, price: 420 }]);
  });
  it("ignores tiny quantity/average differences (rounding noise)", () => {
    const plan = planSyncOps(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400 }],
      [{ symbol: "IVV", quantity: 10.00005, avgPrice: 400.005, marketValue: 4000 }],
    );
    expect(plan.ops).toEqual([]);
    expect(plan.hasChanges).toBe(false);
  });
  it("never touches symbols missing from the screenshot", () => {
    const plan = planSyncOps(
      [
        { symbol: "IVV", quantity: 10, avgPrice: 400 },
        { symbol: "QQQ", quantity: 5, avgPrice: 500 },
      ],
      [{ symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: 4000 }],
    );
    expect(plan.ops).toEqual([]);
    expect(plan.untouchedSymbols).toEqual(["QQQ"]);
  });
  it("skips positions without a recognized average price", () => {
    const plan = planSyncOps(
      [],
      [{ symbol: "QQQ", quantity: 5, avgPrice: null, marketValue: 2600 }],
    );
    expect(plan.ops).toEqual([]);
    expect(plan.rows[0]?.note).toMatch("חסר מחיר קנייה");
  });
  it("reconciles totals within tolerance and flags mismatches", () => {
    const ok = checkSyncTotals(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: 4000 }],
      100,
      4100,
    );
    expect(ok.checked).toBe(true);
    expect(ok.ok).toBe(true);
    const bad = checkSyncTotals(
      [{ symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: 4000 }],
      100,
      5000,
    );
    expect(bad.checked).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.diff).toBe(-900);
  });
  it("skips the totals check when data is missing", () => {
    expect(
      checkSyncTotals(
        [{ symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: null }],
        100,
        4100,
      ).checked,
    ).toBe(false);
    expect(checkSyncTotals([], null, 4100).checked).toBe(false);
    expect(checkSyncTotals([], 100, null).checked).toBe(false);
  });
  it("parses a valid AI response and drops invalid rows", () => {
    const scan = parseIbPortfolioScan(
      '```json\n{"cash_usd": 123.45, "total_value_usd": 10000, "confidence": "high", "positions": [{"symbol": "ivv", "quantity": 10, "avg_price": 400, "market_value": 4200}, {"symbol": "", "quantity": 5}, {"symbol": "QQQ", "quantity": -3}]}```',
    );
    expect(scan.ok).toBe(true);
    expect(scan.cashUsd).toBe(123.45);
    expect(scan.totalValueUsd).toBe(10000);
    expect(scan.confidence).toBe("high");
    expect(scan.positions).toEqual([
      { symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: 4200 },
    ]);
  });
  it("fails gracefully on garbage AI output", () => {
    expect(parseIbPortfolioScan("not json at all").ok).toBe(false);
    expect(parseIbPortfolioScan('{"positions": []}').ok).toBe(false);
  });
});
