import { describe, expect, it } from "vitest";
import { computeAccountTotals } from "./account-totals";

const BASE = {
  kind: "savings",
  currency: "ILS",
  starting_balance: 1000,
  starting_balance_ils: 1000,
  balance_reset_at: null,
} as const;

describe("computeAccountTotals", () => {
  it("returns the baseline when there are no transactions", () => {
    const totals = computeAccountTotals({
      accounts: [{ id: "a", ...BASE }],
      transactions: [],
      journalEntries: [],
      fxRate: 3.5,
    });
    expect(totals.get("a")).toEqual({ native: 1000, ils: 1000 });
  });

  it("adds investment transactions to the baseline", () => {
    const totals = computeAccountTotals({
      accounts: [{ id: "a", ...BASE }],
      transactions: [
        {
          investment_account_id: "a",
          amount: 200,
          amount_ils: 200,
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          investment_account_id: "a",
          amount: -50,
          amount_ils: -50,
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
      journalEntries: [],
      fxRate: 3.5,
    });
    expect(totals.get("a")).toEqual({ native: 1150, ils: 1150 });
  });

  it("ignores transactions created before the last balance reset", () => {
    const totals = computeAccountTotals({
      accounts: [{ id: "a", ...BASE, balance_reset_at: "2026-02-01T00:00:00Z" }],
      transactions: [
        {
          investment_account_id: "a",
          amount: 999,
          amount_ils: 999,
          created_at: "2026-01-15T00:00:00Z",
        },
        {
          investment_account_id: "a",
          amount: 100,
          amount_ils: 100,
          created_at: "2026-02-02T00:00:00Z",
        },
      ],
      journalEntries: [],
      fxRate: 3.5,
    });
    expect(totals.get("a")).toEqual({ native: 1100, ils: 1100 });
  });

  it("excludes IB accounts entirely", () => {
    const totals = computeAccountTotals({
      accounts: [
        { id: "ib", ...BASE, kind: "interactive" },
        { id: "a", ...BASE },
      ],
      transactions: [
        {
          investment_account_id: "ib",
          amount: 500,
          amount_ils: 500,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      journalEntries: [],
      fxRate: 3.5,
    });
    expect(totals.has("ib")).toBe(false);
    expect(totals.get("a")).toEqual({ native: 1000, ils: 1000 });
  });

  it("adds journal P&L as-is to a USD account and converts the ILS part", () => {
    const totals = computeAccountTotals({
      accounts: [
        { id: "a", ...BASE, currency: "USD", starting_balance: 100, starting_balance_ils: 350 },
      ],
      transactions: [],
      journalEntries: [
        { investment_account_id: "a", pnl_usd: 35, created_at: "2026-01-01T00:00:00Z" },
      ],
      fxRate: 3.5,
    });
    expect(totals.get("a")).toEqual({ native: 135, ils: 350 + 35 * 3.5 });
  });

  it("converts journal P&L for an ILS account, and skips it without a rate", () => {
    const input = {
      accounts: [{ id: "a", ...BASE }],
      transactions: [],
      journalEntries: [
        { investment_account_id: "a", pnl_usd: 10, created_at: "2026-01-01T00:00:00Z" },
      ],
    };
    expect(computeAccountTotals({ ...input, fxRate: 4 }).get("a")).toEqual({
      native: 1040,
      ils: 1040,
    });
    // No rate: the P&L is left out rather than guessed.
    expect(computeAccountTotals({ ...input, fxRate: null }).get("a")).toEqual({
      native: 1000,
      ils: 1000,
    });
  });

  it("ignores journal entries created before the last balance reset", () => {
    const totals = computeAccountTotals({
      accounts: [
        {
          id: "a",
          ...BASE,
          currency: "USD",
          starting_balance: 100,
          starting_balance_ils: 350,
          balance_reset_at: "2026-02-01T00:00:00Z",
        },
      ],
      transactions: [],
      journalEntries: [
        { investment_account_id: "a", pnl_usd: 999, created_at: "2026-01-15T00:00:00Z" },
        { investment_account_id: "a", pnl_usd: 5, created_at: "2026-02-02T00:00:00Z" },
      ],
      fxRate: 3.5,
    });
    expect(totals.get("a")).toEqual({ native: 105, ils: 350 + 5 * 3.5 });
  });
});
