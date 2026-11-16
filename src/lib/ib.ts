import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";
import type { InvestmentAccount } from "@/lib/db";
import type { SyncOp } from "@/lib/ib-sync-rules";

/**
 * Interactive Brokers portfolios.
 *
 * A portfolio IS an investment_accounts row with kind = 'interactive' — no
 * hardcoded UUID anywhere. ib_holdings / ib_positions /
 * ib_position_transactions all carry investment_account_id, so each portfolio
 * holds its own stocks and cash.
 *
 * Trades go through atomic Postgres RPCs (buy_ib_shares / sell_ib_shares /
 * set_ib_cash / apply_ib_sync): one transaction for ledger + position + cash
 * + history log, with the cash row locked — no more partial states or races
 * between two phones. The client never computes the new cash balance.
 */

export type IbPortfolio = InvestmentAccount;

export const IB_KIND = "interactive";
export const KID_PORTFOLIO_NAME = "אינטראקטיב - הילד";

export interface IbHoldings {
  id: string;
  household_id: string;
  investment_account_id: string;
  cash_usd: number;
}

export interface IbPosition {
  id: string;
  household_id: string;
  investment_account_id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
}

export interface IbTransaction {
  id: string;
  position_id: string | null;
  investment_account_id: string;
  symbol: string;
  kind: "buy" | "sell" | "adjust";
  quantity: number;
  price: number;
  prior_avg_price: number | null;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

function friendlyRpcError(e: unknown): Error {
  const msg = (e as { message?: string } | null)?.message ?? "";
  if (msg.includes("insufficient_cash")) return new Error("אין מספיק מזומן לביצוע הקנייה");
  if (msg.includes("insufficient_shares")) return new Error("אין מספיק מניות בהחזקה");
  if (msg.includes("position_not_found")) return new Error("ההחזקה לא נמצאה");
  if (msg.includes("account_not_found")) return new Error("תיק ההשקעות לא נמצא");
  if (msg.includes("invalid_quantity")) return new Error("כמות חייבת להיות חיובית");
  if (msg.includes("invalid_price")) return new Error("מחיר חייב להיות תקין");
  if (msg.includes("invalid_symbol")) return new Error("יש להזין סימבול");
  if (msg.includes("invalid_cash")) return new Error("יתרת מזומן חייבת להיות מספר חיובי");
  if (msg.includes("invalid_sync_op") || msg.includes("invalid_sync_action")) {
    return new Error("פעולת סנכרון לא תקינה");
  }
  return e instanceof Error ? e : new Error("שגיאה לא ידועה");
}

/** All IB portfolios of the household, ordered like the accounts list. */
export async function fetchIbPortfolios(): Promise<IbPortfolio[]> {
  const { data, error } = await supabase
    .from("investment_accounts")
    .select("*")
    .eq("kind", IB_KIND)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Create a new IB portfolio (investment account + empty cash row). */
export async function createIbPortfolio(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("יש להזין שם לתיק");
  const household_id = await getMyHouseholdId();
  const { data, error } = await supabase
    .from("investment_accounts")
    .insert({
      household_id,
      name: trimmed,
      kind: IB_KIND,
      color: "#6366f1",
      currency: "USD",
      sort_order: 4,
      starting_balance: 0,
      starting_balance_ils: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: hErr } = await supabase
    .from("ib_holdings")
    .insert({ household_id, investment_account_id: data.id, cash_usd: 0 });
  if (hErr) throw hErr;
  return data.id;
}

export async function fetchIbHoldings(accountId: string): Promise<IbHoldings | null> {
  const { data, error } = await supabase
    .from("ib_holdings")
    .select("*")
    .eq("investment_account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    household_id: data.household_id,
    investment_account_id: data.investment_account_id,
    cash_usd: Number(data.cash_usd ?? 0),
  };
}

/** Cash rows of ALL portfolios (for the investments overview page). */
export async function fetchAllIbHoldings(): Promise<IbHoldings[]> {
  const { data, error } = await supabase.from("ib_holdings").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    household_id: r.household_id,
    investment_account_id: r.investment_account_id,
    cash_usd: Number(r.cash_usd ?? 0),
  }));
}

/** Sets the cash balance via the atomic RPC (logs the change in history). */
export async function setIbCash(accountId: string, usd: number): Promise<void> {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("יתרת מזומן חייבת להיות מספר חיובי");
  const { error } = await supabase.rpc("set_ib_cash", {
    _account_id: accountId,
    _cash_usd: usd,
  });
  if (error) throw friendlyRpcError(error);
}

export async function fetchIbPositions(accountId: string): Promise<IbPosition[]> {
  const { data, error } = await supabase
    .from("ib_positions")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("symbol");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    household_id: r.household_id,
    investment_account_id: r.investment_account_id,
    symbol: r.symbol,
    quantity: Number(r.quantity ?? 0),
    avg_price: Number(r.avg_price ?? 0),
  }));
}

/** Positions of ALL portfolios (for the investments overview page). */
export async function fetchAllIbPositions(): Promise<IbPosition[]> {
  const { data, error } = await supabase.from("ib_positions").select("*").order("symbol");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    household_id: r.household_id,
    investment_account_id: r.investment_account_id,
    symbol: r.symbol,
    quantity: Number(r.quantity ?? 0),
    avg_price: Number(r.avg_price ?? 0),
  }));
}

export async function deleteIbPosition(id: string): Promise<void> {
  const { error } = await supabase.from("ib_positions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchIbTransactions(
  accountId: string,
  symbol?: string,
): Promise<IbTransaction[]> {
  let query = supabase
    .from("ib_position_transactions")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (symbol) query = query.eq("symbol", symbol.trim().toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    position_id: r.position_id,
    investment_account_id: r.investment_account_id,
    symbol: r.symbol,
    kind: r.kind as "buy" | "sell" | "adjust",
    quantity: Number(r.quantity),
    price: Number(r.price),
    prior_avg_price: r.prior_avg_price != null ? Number(r.prior_avg_price) : null,
    occurred_at: r.occurred_at,
    note: r.note,
    created_at: r.created_at,
  }));
}

/**
 * Buy shares of a symbol (new or existing position) via the atomic RPC:
 * weighted-average cost, ledger entry, cash debit and history log happen in
 * one database transaction. The server validates the cash balance — the
 * client never computes the new balance, so two phones can't race.
 */
export async function buyIbShares(input: {
  accountId: string;
  symbol: string;
  quantity: number;
  price: number;
  occurred_at: string;
  note?: string;
  adjustCash: boolean;
}): Promise<void> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("יש להזין סימבול");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("כמות חייבת להיות חיובית");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new Error("מחיר חייב להיות תקין");
  }
  const { error } = await supabase.rpc("buy_ib_shares", {
    _account_id: input.accountId,
    _symbol: symbol,
    _quantity: input.quantity,
    _price: input.price,
    _occurred_at: input.occurred_at,
    _note: input.note ?? undefined,
    _adjust_cash: input.adjustCash,
  });
  if (error) throw friendlyRpcError(error);
}

/**
 * Sell shares of an existing position via the atomic RPC. Average cost basis
 * of the remaining shares is unchanged; a full sell removes the position but
 * the ledger entries stay. Returns the realized P&L of this sale.
 */
export async function sellIbShares(input: {
  accountId: string;
  symbol: string;
  quantity: number;
  price: number;
  occurred_at: string;
  note?: string;
  adjustCash: boolean;
}): Promise<{ realizedPnl: number }> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("כמות חייבת להיות חיובית");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new Error("מחיר חייב להיות תקין");
  }
  const { data, error } = await supabase.rpc("sell_ib_shares", {
    _account_id: input.accountId,
    _symbol: symbol,
    _quantity: input.quantity,
    _price: input.price,
    _occurred_at: input.occurred_at,
    _note: input.note ?? undefined,
    _adjust_cash: input.adjustCash,
  });
  if (error) throw friendlyRpcError(error);
  const result = data as { realized_pnl?: number } | null;
  return { realizedPnl: Number(result?.realized_pnl ?? 0) };
}

/**
 * Apply an AI-recognized portfolio (from planSyncOps) in ONE atomic
 * transaction: all buy/sell/adjust ops plus the cash balance. Only called
 * after the user explicitly confirms in the sync review dialog.
 */
export async function applyIbSync(input: {
  accountId: string;
  cashUsd: number;
  ops: SyncOp[];
  occurredAt: string;
}): Promise<{ opsApplied: number; cashUsd: number }> {
  if (!Number.isFinite(input.cashUsd) || input.cashUsd < 0) {
    throw new Error("יתרת מזומן חייבת להיות מספר חיובי");
  }
  const { data, error } = await supabase.rpc("apply_ib_sync", {
    _account_id: input.accountId,
    _cash_usd: input.cashUsd,
    // SyncOp is plain JSON data (strings + numbers); the cast bridges the
    // structural gap to the generated Json type (index signature).
    _ops: input.ops as unknown as Json,
    _occurred_at: input.occurredAt,
    _note: "סנכרון מ-IBKR",
  });
  if (error) throw friendlyRpcError(error);
  const result = data as { ops_applied?: number; cash_usd?: number } | null;
  return {
    opsApplied: Number(result?.ops_applied ?? 0),
    cashUsd: Number(result?.cash_usd ?? input.cashUsd),
  };
}
