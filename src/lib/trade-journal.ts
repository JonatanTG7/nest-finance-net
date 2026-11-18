import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";

export type TradeJournalEntry = Database["public"]["Tables"]["trade_journal_entries"]["Row"];
export type TradeSide = "long" | "short";

/* ------------------------------------------------------------------ *
 * Pure rules
 * ------------------------------------------------------------------ */

/** Tickers are stored uppercase without whitespace. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export interface TradeJournalSummary {
  count: number;
  totalPnl: number;
  wins: number;
  losses: number;
  /** Share of decided trades (win or loss) that were wins, 0–1. Null with no decided trades. */
  winRate: number | null;
}

/**
 * Filters journal entries by ticker: case-insensitive substring match on
 * the normalized (uppercase, trimmed) symbol. An empty query returns every
 * entry. The summary then covers only the matching trades of that asset.
 */
export function filterJournalEntriesBySymbol<T extends { symbol: string }>(
  entries: T[],
  query: string,
): T[] {
  const q = normalizeSymbol(query);
  if (!q) return entries;
  return entries.filter((e) => normalizeSymbol(e.symbol).includes(q));
}

/**
 * Total journal P&L (USD) counted toward the displayed account balance:
 * only entries created after the account's last manual balance reset.
 * A reset absorbs every earlier trade into the new baseline, so older
 * entries must not be counted again. Entries without created_at are
 * counted (same rule as investment transactions).
 */
export function journalPnlUsdAfterReset(
  entries: (Pick<TradeJournalEntry, "pnl_usd"> & { created_at: string | null })[],
  balanceResetAt: string | null,
): number {
  if (!balanceResetAt) {
    return entries.reduce((sum, e) => sum + Number(e.pnl_usd), 0);
  }
  const reset = new Date(balanceResetAt).getTime();
  let total = 0;
  for (const e of entries) {
    if (!e.created_at || new Date(e.created_at).getTime() > reset) {
      total += Number(e.pnl_usd);
    }
  }
  return total;
}

/** Summary over journal entries. Breakeven trades (P&L 0) count as neither win nor loss. */
export function tradeJournalSummary(
  entries: Pick<TradeJournalEntry, "pnl_usd">[],
): TradeJournalSummary {
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  for (const e of entries) {
    const pnl = Number(e.pnl_usd);
    totalPnl += pnl;
    if (pnl > 0) wins += 1;
    else if (pnl < 0) losses += 1;
  }
  const decided = wins + losses;
  return {
    count: entries.length,
    totalPnl,
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
  };
}

/* ------------------------------------------------------------------ *
 * Data access. Journal P&L counts toward the displayed account
 * balance (see journalPnlUsdAfterReset): adding a trade applies its
 * P&L, deleting one reverses it, editing applies the difference.
 * Entries are never written as transactions rows — the journal is its
 * own table, and the balance math reads it directly.
 * ------------------------------------------------------------------ */

export interface TradeJournalInput {
  symbol: string;
  side: TradeSide;
  quantity: number;
  pnl_usd: number;
  note: string;
  occurred_at: string;
}

/**
 * Every journal entry of the household (RLS-scoped), across accounts — for
 * the assets index, which folds each account's journal P&L into its card.
 */
export async function fetchAllTradeJournalEntries(): Promise<TradeJournalEntry[]> {
  const { data, error } = await supabase
    .from("trade_journal_entries")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTradeJournalEntries(accountId: string): Promise<TradeJournalEntry[]> {
  const { data, error } = await supabase
    .from("trade_journal_entries")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTradeJournalEntry(
  accountId: string,
  input: TradeJournalInput,
): Promise<TradeJournalEntry> {
  const household_id = await getMyHouseholdId();
  const { data, error } = await supabase
    .from("trade_journal_entries")
    .insert({
      ...input,
      symbol: normalizeSymbol(input.symbol),
      household_id,
      investment_account_id: accountId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TradeJournalEntry;
}

export async function updateTradeJournalEntry(
  id: string,
  patch: Partial<TradeJournalInput>,
): Promise<void> {
  const { symbol, ...rest } = patch;
  const { error } = await supabase
    .from("trade_journal_entries")
    .update({
      ...rest,
      ...(symbol !== undefined ? { symbol: normalizeSymbol(symbol) } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTradeJournalEntry(id: string): Promise<void> {
  const { error } = await supabase.from("trade_journal_entries").delete().eq("id", id);
  if (error) throw error;
}
