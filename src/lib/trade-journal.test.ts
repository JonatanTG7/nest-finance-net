import { describe, expect, it } from "vitest";
import {
  filterJournalEntriesBySymbol,
  journalPnlUsdAfterReset,
  normalizeSymbol,
  tradeJournalSummary,
} from "./trade-journal";

describe("normalizeSymbol", () => {
  it("uppercases and trims tickers", () => {
    expect(normalizeSymbol("  qqq ")).toBe("QQQ");
    expect(normalizeSymbol("NVDA")).toBe("NVDA");
    expect(normalizeSymbol("msbt")).toBe("MSBT");
  });
});

describe("tradeJournalSummary", () => {
  it("sums P&L and counts wins/losses", () => {
    const s = tradeJournalSummary([
      { pnl_usd: 120 },
      { pnl_usd: -40 },
      { pnl_usd: 0 },
      { pnl_usd: 25.5 },
    ]);
    expect(s.count).toBe(4);
    expect(s.totalPnl).toBeCloseTo(105.5);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3);
  });

  it("returns null win rate with no decided trades", () => {
    expect(tradeJournalSummary([]).winRate).toBeNull();
    expect(tradeJournalSummary([{ pnl_usd: 0 }]).winRate).toBeNull();
    expect(tradeJournalSummary([]).totalPnl).toBe(0);
  });
});

describe("filterJournalEntriesBySymbol", () => {
  const entries = [{ symbol: "QQQ" }, { symbol: "NVDA" }, { symbol: "QQQM" }];

  it("returns all entries for an empty query", () => {
    expect(filterJournalEntriesBySymbol(entries, "")).toEqual(entries);
    expect(filterJournalEntriesBySymbol(entries, "   ")).toEqual(entries);
  });

  it("matches case-insensitively and trims", () => {
    expect(filterJournalEntriesBySymbol(entries, "  qqq ")).toEqual([
      { symbol: "QQQ" },
      { symbol: "QQQM" },
    ]);
    expect(filterJournalEntriesBySymbol(entries, "nvda")).toEqual([{ symbol: "NVDA" }]);
  });

  it("matches by substring", () => {
    expect(filterJournalEntriesBySymbol(entries, "QQ")).toEqual([
      { symbol: "QQQ" },
      { symbol: "QQQM" },
    ]);
    expect(filterJournalEntriesBySymbol(entries, "DA")).toEqual([{ symbol: "NVDA" }]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterJournalEntriesBySymbol(entries, "AAPL")).toEqual([]);
  });
});

describe("journalPnlUsdAfterReset", () => {
  const entries = [
    { pnl_usd: 100, created_at: "2026-01-10T10:00:00Z" },
    { pnl_usd: -20, created_at: "2026-02-10T10:00:00Z" },
    { pnl_usd: 50, created_at: "2026-03-10T10:00:00Z" },
  ];

  it("sums all entries when there was no reset", () => {
    expect(journalPnlUsdAfterReset(entries, null)).toBeCloseTo(130);
    expect(journalPnlUsdAfterReset([], null)).toBe(0);
  });

  it("counts only entries created after the reset", () => {
    // A reset on 2026-02-01 absorbs the January trade into the baseline.
    expect(journalPnlUsdAfterReset(entries, "2026-02-01T00:00:00Z")).toBeCloseTo(30);
    // A reset after every trade absorbs them all.
    expect(journalPnlUsdAfterReset(entries, "2026-04-01T00:00:00Z")).toBe(0);
  });

  it("excludes an entry created exactly at the reset time", () => {
    expect(journalPnlUsdAfterReset(entries, "2026-02-10T10:00:00Z")).toBeCloseTo(50);
  });

  it("counts entries without created_at", () => {
    expect(
      journalPnlUsdAfterReset(
        [{ pnl_usd: 7, created_at: null }, ...entries],
        "2026-02-01T00:00:00Z",
      ),
    ).toBeCloseTo(37);
  });
});
