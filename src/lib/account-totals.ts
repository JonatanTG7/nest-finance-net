import { IB_KIND } from "@/lib/ib";
import { journalPnlUsdAfterReset, type TradeJournalEntry } from "@/lib/trade-journal";
import type { InvestmentAccount } from "@/lib/db";

export interface AccountTotals {
  native: number;
  ils: number | null;
}

type AccountInput = Pick<
  InvestmentAccount,
  "id" | "kind" | "currency" | "starting_balance" | "starting_balance_ils" | "balance_reset_at"
>;

interface TransactionInput {
  investment_account_id: string | null;
  amount: number;
  amount_ils: number;
  created_at: string | null;
}

type JournalInput = Pick<TradeJournalEntry, "investment_account_id" | "pnl_usd" | "created_at">;

/**
 * Displayed balance per non-IB account: the manual baseline
 * (starting_balance) plus investment transactions created after the last
 * manual balance reset, plus trade-journal P&L after the reset. A reset
 * absorbs everything older into the baseline, so older rows must not be
 * counted again. P&L is in USD — a USD account takes it as-is, an ILS
 * account converts at the live rate; when no rate is available the ILS
 * part is left out rather than guessed.
 *
 * IB portfolios are excluded — they are valued from live positions, never
 * from transactions. Callers overlay their IB totals afterwards.
 */
export function computeAccountTotals(input: {
  accounts: AccountInput[];
  transactions: TransactionInput[];
  journalEntries: JournalInput[];
  fxRate: number | null;
}): Map<string, AccountTotals> {
  const { accounts, transactions, journalEntries, fxRate } = input;
  const totals = new Map<string, AccountTotals>();
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  for (const a of accounts) {
    if (a.kind === IB_KIND) continue;
    totals.set(a.id, {
      native: Number(a.starting_balance ?? 0),
      ils: Number(a.starting_balance_ils ?? a.starting_balance ?? 0),
    });
  }

  for (const t of transactions) {
    if (!t.investment_account_id) continue;
    const account = accountById.get(t.investment_account_id);
    if (!account || account.kind === IB_KIND) continue;
    // After a manual balance reset, only transactions created after the
    // reset count toward the balance — older ones stay in history.
    if (
      account.balance_reset_at &&
      t.created_at &&
      new Date(t.created_at).getTime() <= new Date(account.balance_reset_at).getTime()
    ) {
      continue;
    }
    const cur = totals.get(t.investment_account_id);
    if (!cur) continue;
    cur.native += Number(t.amount);
    cur.ils = (cur.ils ?? 0) + Number(t.amount_ils);
  }

  const journalByAccount = new Map<string, JournalInput[]>();
  for (const e of journalEntries) {
    const arr = journalByAccount.get(e.investment_account_id) ?? [];
    arr.push(e);
    journalByAccount.set(e.investment_account_id, arr);
  }
  for (const a of accounts) {
    if (a.kind === IB_KIND) continue;
    const entries = journalByAccount.get(a.id);
    if (!entries || entries.length === 0) continue;
    const pnlUsd = journalPnlUsdAfterReset(entries, a.balance_reset_at);
    const cur = totals.get(a.id);
    if (!cur) continue;
    if (a.currency === "USD") {
      cur.native += pnlUsd;
      if (fxRate != null) cur.ils = (cur.ils ?? 0) + pnlUsd * fxRate;
    } else if (fxRate != null) {
      // Non-USD accounts are ILS (only ILS/USD exist): the native figure
      // is in ILS, so both native and ILS need the conversion.
      cur.native += pnlUsd * fxRate;
      cur.ils = (cur.ils ?? 0) + pnlUsd * fxRate;
    }
  }

  return totals;
}
