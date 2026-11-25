/**
 * Pure IB portfolio math — no I/O, fully tested (see ib-rules.test.ts).
 * The same formulas live in the Postgres trade RPCs; keep both in sync:
 * weighted-average cost basis, realized/unrealized P&L, market value.
 *
 * FX rule (applies everywhere in the app): a missing or invalid rate is
 * NEVER treated as 1 or as a hardcoded guess — toIls() returns null and the
 * UI shows "rate unavailable" instead of a wrong shekel number.
 */

import { israelToday } from "./email-digest-rules";

/** Weighted-average cost basis after buying `qty` at `price`. */
export function weightedAvg(oldQty: number, oldAvg: number, qty: number, price: number): number {
  if (oldQty < 0 || oldAvg < 0 || qty <= 0 || price < 0) {
    throw new Error("invalid weighted-average inputs");
  }
  const newQty = oldQty + qty;
  if (newQty <= 0) return price;
  return (oldQty * oldAvg + qty * price) / newQty;
}

/** Realized P&L of selling `qty` shares at `price` against average cost `avg`. */
export function realizedPnl(price: number, avg: number, qty: number): number {
  return (price - avg) * qty;
}

export interface SellTransactionInput {
  kind: string;
  price: number;
  prior_avg_price: number | null;
  quantity: number;
  /** Trade date as "YYYY-MM-DD" (the occurred_at date column). */
  occurred_at?: string;
}

/**
 * Total realized P&L across sell transactions. A sell without a recorded
 * prior average cost contributes 0 — its basis is unknown, not zero.
 */
export function totalRealizedPnl(transactions: SellTransactionInput[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.kind === "sell" && t.prior_avg_price != null) {
      sum += realizedPnl(t.price, t.prior_avg_price, t.quantity);
    }
  }
  return sum;
}

/**
 * Realized P&L for TODAY only — the header's Realized P&L resets every
 * day. Only sells whose occurred_at is today count; buys never realize
 * P&L, and a sell without a recorded prior average cost contributes 0.
 * A sell with no date can't be attributed to a day, so it contributes 0
 * too — never guessed into today.
 *
 * "Today" is the Israel calendar day (Asia/Jerusalem, via israelToday —
 * the app's established Israel-day primitive), not the UTC day: for the
 * first hours of every day the two differ. occurred_at is a plain date
 * string, but the first 10 chars are compared so a timestamp form would
 * still match by its calendar date.
 */
export function dailyRealizedPnl(
  transactions: SellTransactionInput[],
  now: Date = new Date(),
): number {
  const today = israelToday(now).ymd;
  let sum = 0;
  for (const t of transactions) {
    const day = typeof t.occurred_at === "string" ? t.occurred_at.slice(0, 10) : "";
    if (t.kind === "sell" && day === today && t.prior_avg_price != null) {
      sum += realizedPnl(t.price, t.prior_avg_price, t.quantity);
    }
  }
  return sum;
}

/**
 * Daily change in percent vs the start-of-day portfolio value (current value
 * minus today's change), or null when it cannot be computed (non-positive
 * start-of-day value).
 */
export function dailyChangePct(dailyChange: number, portfolioUsd: number): number | null {
  const startOfDay = portfolioUsd - dailyChange;
  if (!(startOfDay > 0)) return null;
  return (dailyChange / startOfDay) * 100;
}

/**
 * Market value of a position. With no live price we fall back to cost basis
 * so the portfolio total never crashes to 0 — the caller must treat the
 * resulting unrealized P&L as unknown (see unrealizedPnl).
 */
export function positionMarketValue(
  quantity: number,
  lastPrice: number | null,
  avgPrice: number,
): number {
  return quantity * (lastPrice ?? avgPrice);
}

/** Unrealized P&L, or null when there is no live price (unknown, not zero). */
export function unrealizedPnl(
  lastPrice: number | null,
  avgPrice: number,
  quantity: number,
): number | null {
  if (lastPrice == null) return null;
  return (lastPrice - avgPrice) * quantity;
}

/** Unrealized P&L in percent, or null when it cannot be computed. */
export function unrealizedPct(lastPrice: number | null, avgPrice: number): number | null {
  if (lastPrice == null || avgPrice <= 0) return null;
  return ((lastPrice - avgPrice) / avgPrice) * 100;
}

/** A rate is usable only if it is a finite positive number. */
export function isFxRateUsable(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

/** Convert USD to ILS, or null when the rate is missing/invalid. Never invents a rate. */
export function toIls(usd: number, rate: number | null | undefined): number | null {
  if (!isFxRateUsable(rate)) return null;
  return usd * rate;
}

export interface PortfolioRowInput {
  marketValue: number;
  unrealized: number | null;
  dailyChangeAbs: number | null;
}

export interface PortfolioTotals {
  marketValue: number;
  unrealized: number;
  unrealizedKnown: boolean;
  dailyChange: number;
}

/** Sum position rows into portfolio totals. `unrealizedKnown` is false when any
 *  position has no live price — the summed unrealized P&L is then partial. */
export function portfolioTotals(rows: PortfolioRowInput[]): PortfolioTotals {
  let marketValue = 0;
  let unrealized = 0;
  let unrealizedKnown = true;
  let dailyChange = 0;
  for (const r of rows) {
    marketValue += r.marketValue;
    if (r.unrealized == null) unrealizedKnown = false;
    else unrealized += r.unrealized;
    dailyChange += r.dailyChangeAbs ?? 0;
  }
  return { marketValue, unrealized, unrealizedKnown, dailyChange };
}

/** Cost basis of a position: quantity × average price. */
export function positionCostBasis(quantity: number, avgPrice: number): number {
  return quantity * avgPrice;
}

/** Weight of one position in the portfolio, or null when the total is 0. */
export function positionWeight(marketValue: number, portfolioUsd: number): number | null {
  if (!(portfolioUsd > 0)) return null;
  return (marketValue / portfolioUsd) * 100;
}
