import { describe, expect, it } from "vitest";
import {
  computeIbTotals,
  computeNetWorth,
  grandTotalIls,
  grandTotalIlsShared,
  type NetWorthAccountInput,
} from "./net-worth";

const ibAccount: NetWorthAccountInput = {
  id: "ib-1",
  kind: "interactive",
  currency: "USD",
  starting_balance: 0,
  starting_balance_ils: 0,
  balance_reset_at: null,
};

const ilsAccount: NetWorthAccountInput = {
  id: "acc-ils",
  kind: "savings",
  currency: "ILS",
  starting_balance: 10000,
  starting_balance_ils: 10000,
  balance_reset_at: null,
};

const usdAccount: NetWorthAccountInput = {
  id: "acc-usd",
  kind: "investment",
  currency: "USD",
  starting_balance: 1000,
  starting_balance_ils: 3600,
  balance_reset_at: null,
};

const privateAccount: NetWorthAccountInput = {
  id: "acc-private",
  kind: "pension",
  currency: "ILS",
  starting_balance: 70000,
  starting_balance_ils: 70000,
  balance_reset_at: null,
  person: "yonatan",
};

describe("computeIbTotals", () => {
  it("values positions at live prices plus cash", () => {
    const m = computeIbTotals(
      [{ investment_account_id: "ib-1", cash_usd: 500 }],
      [
        { investment_account_id: "ib-1", symbol: "QQQ", quantity: 10, avg_price: 500 },
        { investment_account_id: "ib-1", symbol: "NVDA", quantity: 5, avg_price: 150 },
      ],
      [
        { symbol: "QQQ", last: 600 },
        { symbol: "NVDA", last: 200 },
      ],
      3.5,
    );
    const t = m.get("ib-1")!;
    expect(t.native).toBeCloseTo(500 + 6000 + 1000);
    expect(t.ils).toBeCloseTo((500 + 6000 + 1000) * 3.5);
    expect(t.count).toBe(2);
  });

  it("falls back to avg price when no quote", () => {
    const m = computeIbTotals(
      [{ investment_account_id: "ib-1", cash_usd: 0 }],
      [{ investment_account_id: "ib-1", symbol: "QQQ", quantity: 10, avg_price: 500 }],
      [{ symbol: "QQQ", last: null }],
      3.5,
    );
    expect(m.get("ib-1")!.native).toBe(5000);
  });

  it("includes cash-only portfolios and nulls ILS without an FX rate", () => {
    const m = computeIbTotals([{ investment_account_id: "ib-1", cash_usd: 250 }], [], [], null);
    const t = m.get("ib-1")!;
    expect(t.native).toBe(250);
    expect(t.ils).toBeNull();
    expect(t.count).toBe(0);
  });
});

// Non-IB arithmetic (baselines, post-reset transactions, journal P&L) is
// covered by account-totals.test.ts — here only the composition is tested:
// IB overlay, the grand total, and the missing-FX flag.
describe("computeNetWorth", () => {
  it("sums every account type into one grand total", () => {
    const { totals, grandIls, ibIlsMissing } = computeNetWorth({
      accounts: [ibAccount, ilsAccount, usdAccount],
      transactions: [
        {
          investment_account_id: "acc-ils",
          amount: 500,
          amount_ils: 500,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      journalEntries: [],
      ibHoldings: [{ investment_account_id: "ib-1", cash_usd: 500 }],
      ibPositions: [{ investment_account_id: "ib-1", symbol: "QQQ", quantity: 10, avg_price: 500 }],
      quotes: [{ symbol: "QQQ", last: 600 }],
      fxRate: 3.5,
    });
    // IB: (500 + 6000) * 3.5 = 22750; ILS: 10500; USD: 3600.
    expect(totals.get("ib-1")).toEqual({ native: 6500, ils: 22750 });
    expect(grandIls).toBeCloseTo(22750 + 10500 + 3600);
    expect(ibIlsMissing).toBe(false);
  });

  it("never values IB portfolios from transactions", () => {
    const { totals } = computeNetWorth({
      accounts: [ibAccount],
      transactions: [
        {
          investment_account_id: "ib-1",
          amount: 9999,
          amount_ils: 9999,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      journalEntries: [],
      ibHoldings: [{ investment_account_id: "ib-1", cash_usd: 8000 }],
      ibPositions: [],
      quotes: [],
      fxRate: 3.5,
    });
    expect(totals.get("ib-1")).toEqual({ native: 8000, ils: 28000 });
  });

  it("gives an IB portfolio without holdings a null ILS total", () => {
    const { totals, grandIls, ibIlsMissing } = computeNetWorth({
      accounts: [ibAccount, ilsAccount],
      transactions: [],
      journalEntries: [],
      ibHoldings: [],
      ibPositions: [],
      quotes: [],
      fxRate: 3.5,
    });
    expect(totals.get("ib-1")).toEqual({ native: 0, ils: null });
    expect(grandIls).toBe(10000);
    expect(ibIlsMissing).toBe(true);
  });

  it("excludes IB value from the grand total when the FX rate is unavailable", () => {
    const { grandIls, ibIlsMissing } = computeNetWorth({
      accounts: [ibAccount, ilsAccount],
      transactions: [],
      journalEntries: [],
      ibHoldings: [{ investment_account_id: "ib-1", cash_usd: 8000 }],
      ibPositions: [],
      quotes: [],
      fxRate: null,
    });
    expect(grandIls).toBe(10000);
    expect(ibIlsMissing).toBe(true);
  });

  it("excludes private accounts from the grand total but keeps them in the per-account map", () => {
    const { totals, grandIls, ibIlsMissing } = computeNetWorth({
      accounts: [ilsAccount, privateAccount],
      transactions: [],
      journalEntries: [],
      ibHoldings: [],
      ibPositions: [],
      quotes: [],
      fxRate: 3.5,
    });
    // The pension stays visible per-account (person tabs need it) but
    // never enters the household total / digest baseline.
    expect(totals.get("acc-private")).toEqual({ native: 70000, ils: 70000 });
    expect(grandIls).toBe(10000);
    expect(ibIlsMissing).toBe(false);
  });

  it("still counts an IB portfolio even when its owner column names a person", () => {
    const { grandIls } = computeNetWorth({
      accounts: [{ ...ibAccount, person: "yonatan" }, ilsAccount],
      transactions: [],
      journalEntries: [],
      ibHoldings: [{ investment_account_id: "ib-1", cash_usd: 1000 }],
      ibPositions: [],
      quotes: [],
      fxRate: 3.5,
    });
    expect(grandIls).toBeCloseTo(10000 + 3500);
  });
});

describe("grandTotalIls", () => {
  it("sums ILS totals and flags missing IB value", () => {
    const { grandIls, ibIlsMissing } = grandTotalIls(
      new Map([
        ["a", { native: 10000, ils: 10000 }],
        ["ib-1", { native: 8000, ils: null }],
      ]),
    );
    expect(grandIls).toBe(10000);
    expect(ibIlsMissing).toBe(true);
  });

  it("reports no missing value when every total has ILS", () => {
    const { grandIls, ibIlsMissing } = grandTotalIls(
      new Map([
        ["a", { native: 10000, ils: 10000 }],
        ["b", { native: 1000, ils: 3500 }],
      ]),
    );
    expect(grandIls).toBe(13500);
    expect(ibIlsMissing).toBe(false);
  });
});

describe("grandTotalIlsShared", () => {
  it("sums shared accounts only — private, orphan and missing-owner rows handled", () => {
    const { grandIls, ibIlsMissing } = grandTotalIlsShared(
      new Map([
        ["a", { native: 10000, ils: 10000 }],
        ["b", { native: 70000, ils: 70000 }],
        ["c", { native: 5000, ils: 5000 }],
        ["orphan", { native: 9999, ils: 9999 }],
        ["priv-null", { native: 1, ils: null }],
      ]),
      [
        { id: "a", kind: "savings", person: "shared" },
        { id: "b", kind: "pension", person: "yonatan" },
        // No owner at all (pre-migration row) counts as shared.
        { id: "c", kind: "savings" },
        { id: "priv-null", kind: "provident", person: "shiri" },
      ],
    );
    expect(grandIls).toBe(15000);
    // The null ILS belongs to a private account, so it must not flag
    // the shared total as missing anything.
    expect(ibIlsMissing).toBe(false);
  });

  it("still flags a shared IB portfolio with no ILS value", () => {
    const { grandIls, ibIlsMissing } = grandTotalIlsShared(
      new Map([
        ["a", { native: 10000, ils: 10000 }],
        ["ib-1", { native: 8000, ils: null }],
      ]),
      [
        { id: "a", kind: "savings", person: "shared" },
        { id: "ib-1", kind: "interactive", person: "yonatan" },
      ],
    );
    expect(grandIls).toBe(10000);
    expect(ibIlsMissing).toBe(true);
  });
});
