import { describe, expect, it } from "vitest";
import {
  checkSyncTotals,
  draftFromRecognized,
  findDuplicateDraftSymbols,
  parseIbPortfolioScan,
  parseSyncCash,
  parseSyncRowDraft,
  planSyncOps,
  type SyncRowDraft,
} from "./ib-sync-rules";

function draft(over: Partial<SyncRowDraft> = {}): SyncRowDraft {
  return {
    key: "k1",
    symbol: "IVV",
    quantity: "10",
    avgPrice: "400",
    marketValue: 4200,
    baseQuantity: 10,
    manual: false,
    ...over,
  };
}

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

describe("IB sync manual editing", () => {
  it("parses a valid edited row and uppercases the symbol", () => {
    const parsed = parseSyncRowDraft(draft({ symbol: "ivv", quantity: "12.5", avgPrice: "410" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recognized.symbol).toBe("IVV");
      expect(parsed.recognized.quantity).toBe(12.5);
      expect(parsed.recognized.avgPrice).toBe(410);
    }
  });
  it("treats an empty average price as missing (not an error)", () => {
    const parsed = parseSyncRowDraft(draft({ avgPrice: "" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recognized.avgPrice).toBeNull();
  });
  it("rejects bad quantity and bad average price with Hebrew errors", () => {
    expect(parseSyncRowDraft(draft({ quantity: "0" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ quantity: "-3" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ quantity: "abc" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ quantity: "" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ avgPrice: "-5" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ avgPrice: "abc" }))).toMatchObject({ ok: false });
    expect(parseSyncRowDraft(draft({ symbol: "   " }))).toMatchObject({ ok: false });
    const err = parseSyncRowDraft(draft({ quantity: "0" }));
    if (!err.ok) expect(err.error).toMatch("כמות");
  });
  it("recomputes market value from the implied price when quantity is edited", () => {
    // Recognized: 10 shares, market value $4,200 -> implied $420/share.
    const parsed = parseSyncRowDraft(draft({ quantity: "5" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recognized.marketValue).toBeCloseTo(2100, 6);
    // Editing only the average price leaves the market value untouched.
    const avgOnly = parseSyncRowDraft(draft({ avgPrice: "999" }));
    if (avgOnly.ok) expect(avgOnly.recognized.marketValue).toBeCloseTo(4200, 6);
  });
  it("never invents a market value for manual rows", () => {
    const parsed = parseSyncRowDraft(
      draft({ manual: true, marketValue: null, baseQuantity: null, symbol: "QQQ" }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recognized.marketValue).toBeNull();
  });
  it("finds duplicate symbols case-insensitively and ignores blanks", () => {
    expect(
      findDuplicateDraftSymbols([
        draft({ key: "a", symbol: "IVV" }),
        draft({ key: "b", symbol: "ivv" }),
        draft({ key: "c", symbol: "QQQ" }),
        draft({ key: "d", symbol: "" }),
      ]),
    ).toEqual(["IVV"]);
    expect(
      findDuplicateDraftSymbols([draft({ key: "a" }), draft({ key: "b", symbol: "QQQ" })]),
    ).toEqual([]);
  });
  it("parses the editable cash field", () => {
    expect(parseSyncCash("123.45")).toBe(123.45);
    expect(parseSyncCash("0")).toBe(0);
    expect(parseSyncCash("")).toBeNull();
    expect(parseSyncCash("-1")).toBeNull();
    expect(parseSyncCash("abc")).toBeNull();
  });
  it("builds drafts from a scan and feeds edits back into the plan", () => {
    const fromScan = draftFromRecognized(
      { symbol: "IVV", quantity: 10, avgPrice: 400, marketValue: 4200 },
      "scan-0",
    );
    expect(fromScan).toMatchObject({ symbol: "IVV", quantity: "10", avgPrice: "400" });
    // User fixes the quantity 10 -> 12: the plan must gain a buy of 2.
    const parsed = parseSyncRowDraft({ ...fromScan, quantity: "12" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planSyncOps([{ symbol: "IVV", quantity: 10, avgPrice: 400 }], [parsed.recognized]);
    expect(plan.ops).toContainEqual({ symbol: "IVV", action: "buy", quantity: 2, price: 400 });
    // ...and the totals check follows the edit (5 x $420 + $100 cash = $2,200).
    const fixed = parseSyncRowDraft({ ...fromScan, quantity: "5" });
    if (!fixed.ok) return;
    expect(checkSyncTotals([fixed.recognized], 100, 2200).ok).toBe(true);
    expect(checkSyncTotals([fixed.recognized], 100, 5000).ok).toBe(false);
  });
});
