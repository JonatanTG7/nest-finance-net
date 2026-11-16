/**
 * Pure rules for the "📸 סנכרן מ-IBKR" portfolio screenshot sync — no I/O,
 * fully tested (see ib-sync-rules.test.ts).
 *
 * Safety principles:
 * - The broker's screenshot is the source of truth for RECOGNIZED symbols
 *   only. A symbol that exists in the app but was NOT recognized in the
 *   screenshot is left untouched — a cropped/partial screenshot must never
 *   delete positions.
 * - Quantity differences become real buy/sell ledger entries (via the atomic
 *   RPCs), so history stays consistent. A sell caused by sync is priced at
 *   the OLD average, making its realized P&L zero — we don't know the real
 *   sale price, so we must not invent a profit or a loss.
 * - Average-cost differences become 'adjust' entries (the broker's cost basis
 *   is authoritative).
 * - The totals check compares Σ recognized market values + cash against the
 *   screenshot's total value; a mismatch is a warning, never a silent pass.
 */

export interface RecognizedPosition {
  symbol: string;
  quantity: number;
  avgPrice: number | null;
  marketValue: number | null;
}

export interface CurrentPosition {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export type SyncAction = "buy" | "sell" | "adjust";

export interface SyncOp {
  symbol: string;
  action: SyncAction;
  quantity: number;
  price: number;
}

export interface SyncPlanRow {
  symbol: string;
  currentQty: number | null;
  currentAvg: number | null;
  recognizedQty: number;
  recognizedAvg: number | null;
  action: SyncAction | "none";
  opQty: number | null;
  opPrice: number | null;
  note: string;
}

export interface SyncPlan {
  ops: SyncOp[];
  rows: SyncPlanRow[];
  untouchedSymbols: string[];
  hasChanges: boolean;
}

export interface IbPortfolioScan {
  ok: boolean;
  error?: string;
  cashUsd: number | null;
  totalValueUsd: number | null;
  positions: RecognizedPosition[];
  confidence: "high" | "low";
}

const QTY_EPS = 0.0001;
const AVG_EPS = 0.01;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Diff the current portfolio against the AI-recognized one and produce the
 * atomic operations that bring the app to the recognized state.
 */
export function planSyncOps(
  current: CurrentPosition[],
  recognized: RecognizedPosition[],
): SyncPlan {
  const ops: SyncOp[] = [];
  const rows: SyncPlanRow[] = [];
  const currentBy = new Map(current.map((p) => [p.symbol.toUpperCase(), p]));
  const recognizedSymbols = new Set<string>();

  for (const r of recognized) {
    const symbol = r.symbol.trim().toUpperCase();
    if (!symbol || !Number.isFinite(r.quantity) || r.quantity < 0) continue;
    recognizedSymbols.add(symbol);
    const cur = currentBy.get(symbol);
    const recAvg =
      r.avgPrice != null && Number.isFinite(r.avgPrice) && r.avgPrice >= 0 ? r.avgPrice : null;

    if (!cur) {
      if (r.quantity > QTY_EPS && recAvg != null) {
        ops.push({ symbol, action: "buy", quantity: round4(r.quantity), price: recAvg });
        rows.push({
          symbol,
          currentQty: null,
          currentAvg: null,
          recognizedQty: r.quantity,
          recognizedAvg: recAvg,
          action: "buy",
          opQty: round4(r.quantity),
          opPrice: recAvg,
          note: "החזקה חדשה",
        });
      } else {
        rows.push({
          symbol,
          currentQty: null,
          currentAvg: null,
          recognizedQty: r.quantity,
          recognizedAvg: recAvg,
          action: "none",
          opQty: null,
          opPrice: null,
          note: "חסר מחיר קנייה — לא יסונכרן",
        });
      }
      continue;
    }

    const delta = r.quantity - cur.quantity;
    let effectiveQty = cur.quantity;
    let effectiveAvg = cur.avgPrice;
    let action: SyncAction | "none" = "none";
    let opQty: number | null = null;
    let opPrice: number | null = null;
    const notes: string[] = [];

    if (delta > QTY_EPS) {
      if (recAvg == null) {
        rows.push({
          symbol,
          currentQty: cur.quantity,
          currentAvg: cur.avgPrice,
          recognizedQty: r.quantity,
          recognizedAvg: null,
          action: "none",
          opQty: null,
          opPrice: null,
          note: "חסר מחיר קנייה — לא יסונכרן",
        });
        continue;
      }
      ops.push({ symbol, action: "buy", quantity: round4(delta), price: recAvg });
      effectiveQty = r.quantity;
      effectiveAvg = (cur.quantity * cur.avgPrice + delta * recAvg) / r.quantity;
      action = "buy";
      opQty = round4(delta);
      opPrice = recAvg;
      notes.push(`קנייה של ${round4(delta)}`);
    } else if (delta < -QTY_EPS) {
      // Priced at the OLD average: realized P&L stays zero — the real sale
      // price is unknown, so inventing one would fabricate profit/loss.
      ops.push({ symbol, action: "sell", quantity: round4(-delta), price: cur.avgPrice });
      effectiveQty = r.quantity;
      action = "sell";
      opQty = round4(-delta);
      opPrice = cur.avgPrice;
      notes.push(`מכירה של ${round4(-delta)}`);
    }

    if (r.quantity > QTY_EPS && recAvg != null && Math.abs(effectiveAvg - recAvg) > AVG_EPS) {
      ops.push({ symbol, action: "adjust", quantity: round4(r.quantity), price: recAvg });
      if (action === "none") {
        action = "adjust";
        opQty = round4(r.quantity);
        opPrice = recAvg;
      }
      notes.push("עדכון מחיר ממוצע");
    }

    if (r.quantity <= QTY_EPS && cur.quantity > QTY_EPS) {
      // Recognized with (almost) zero quantity: the position is gone.
      // Handled above as a full sell at the old average.
    }

    rows.push({
      symbol,
      currentQty: cur.quantity,
      currentAvg: cur.avgPrice,
      recognizedQty: r.quantity,
      recognizedAvg: recAvg,
      action,
      opQty,
      opPrice,
      note: notes.length > 0 ? notes.join(" · ") : "אין שינוי",
    });
  }

  const untouchedSymbols = current
    .filter((p) => !recognizedSymbols.has(p.symbol.toUpperCase()))
    .map((p) => p.symbol.toUpperCase());

  return { ops, rows, untouchedSymbols, hasChanges: ops.length > 0 };
}

export interface SyncTotalsCheck {
  checked: boolean;
  expected: number | null;
  actual: number | null;
  diff: number | null;
  diffPct: number | null;
  ok: boolean;
}

/**
 * Reconciliation: Σ recognized market values + cash should equal the total
 * value printed on the screenshot. Tolerance: max($1, 1% of total).
 * Returns checked=false when the data needed for the check is missing.
 */
export function checkSyncTotals(
  positions: RecognizedPosition[],
  cashUsd: number | null,
  totalValueUsd: number | null,
): SyncTotalsCheck {
  const noCheck: SyncTotalsCheck = {
    checked: false,
    expected: totalValueUsd,
    actual: null,
    diff: null,
    diffPct: null,
    ok: false,
  };
  if (totalValueUsd == null || cashUsd == null) return noCheck;
  if (positions.some((p) => p.marketValue == null)) return noCheck;
  const actual = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0) + cashUsd;
  const diff = actual - totalValueUsd;
  const diffPct = totalValueUsd !== 0 ? (diff / totalValueUsd) * 100 : null;
  const tolerance = Math.max(1, Math.abs(totalValueUsd) * 0.01);
  return {
    checked: true,
    expected: totalValueUsd,
    actual,
    diff,
    diffPct,
    ok: Math.abs(diff) <= tolerance,
  };
}

/**
 * Manual editing of the recognized portfolio in the review dialog.
 *
 * A row's quantity/avgPrice are raw input strings so half-typed values
 * don't fight the user; they are parsed only when building the plan.
 * `marketValue`/`baseQuantity` come from the scan and let the totals check
 * follow quantity edits through the implied per-share price (the cost basis
 * never affects market value). Manual rows have neither, so the totals
 * check stays unavailable while one is present — we never invent a market
 * value.
 */
export interface SyncRowDraft {
  key: string;
  symbol: string;
  quantity: string;
  avgPrice: string;
  marketValue: number | null;
  baseQuantity: number | null;
  manual: boolean;
}

export type ParsedSyncRowDraft =
  { ok: true; recognized: RecognizedPosition } | { ok: false; error: string };

function parseQuantityInput(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Empty string means "no average price"; returns undefined for invalid text. */
function parsePriceInput(value: string): number | null | undefined {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function draftFromRecognized(r: RecognizedPosition, key: string): SyncRowDraft {
  return {
    key,
    symbol: r.symbol,
    quantity: String(r.quantity),
    avgPrice: r.avgPrice != null ? String(r.avgPrice) : "",
    marketValue: r.marketValue,
    baseQuantity: r.quantity,
    manual: false,
  };
}

/** Validate one editable row and convert it to a recognized position. */
export function parseSyncRowDraft(row: SyncRowDraft): ParsedSyncRowDraft {
  const symbol = row.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: "יש להזין סימבול" };
  const quantity = parseQuantityInput(row.quantity);
  if (quantity == null) return { ok: false, error: "כמות חייבת להיות מספר גדול מ-0" };
  const avgPrice = parsePriceInput(row.avgPrice);
  if (avgPrice === undefined) {
    return { ok: false, error: "מחיר ממוצע חייב להיות מספר שאינו שלילי" };
  }
  let marketValue = row.marketValue;
  if (row.baseQuantity != null && row.baseQuantity > 0 && row.marketValue != null) {
    marketValue = quantity * (row.marketValue / row.baseQuantity);
  }
  return { ok: true, recognized: { symbol, quantity, avgPrice, marketValue } };
}

/** Uppercase symbols appearing in more than one draft row. */
export function findDuplicateDraftSymbols(rows: SyncRowDraft[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    const s = r.symbol.trim().toUpperCase();
    if (!s) continue;
    if (seen.has(s)) dupes.add(s);
    seen.add(s);
  }
  return [...dupes];
}

/** Cash input: a finite, non-negative number — or null when invalid. */
export function parseSyncCash(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const EMPTY_SCAN: IbPortfolioScan = {
  ok: false,
  cashUsd: null,
  totalValueUsd: null,
  positions: [],
  confidence: "low",
};

function toPositiveNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) && Number(v) >= 0) {
    return Number(v);
  }
  return null;
}

/** Parse the AI's raw response into a validated portfolio scan. Never throws. */
export function parseIbPortfolioScan(raw: string): IbPortfolioScan {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const o = JSON.parse(json) as Record<string, unknown>;

    const positionsRaw = Array.isArray(o.positions) ? o.positions : [];
    const positions: RecognizedPosition[] = [];
    for (const p of positionsRaw) {
      if (typeof p !== "object" || p === null) continue;
      const rec = p as Record<string, unknown>;
      const symbol = typeof rec.symbol === "string" ? rec.symbol.trim().toUpperCase() : "";
      const quantity = toPositiveNumber(rec.quantity);
      if (!symbol || quantity == null) continue;
      positions.push({
        symbol,
        quantity,
        avgPrice: toPositiveNumber(rec.avg_price),
        marketValue: toPositiveNumber(rec.market_value),
      });
    }

    const cashUsd = toPositiveNumber(o.cash_usd);
    const totalValueUsd = toPositiveNumber(o.total_value_usd);
    if (positions.length === 0 && cashUsd == null) {
      return { ...EMPTY_SCAN, error: "לא זוהו מניות או מזומן בצילום" };
    }
    return {
      ok: true,
      cashUsd,
      totalValueUsd,
      positions,
      confidence: o.confidence === "high" ? "high" : "low",
    };
  } catch (e) {
    console.error("[ib-sync] parse error", e);
    return { ...EMPTY_SCAN, error: "לא הצלחנו לפענח את תשובת ה-AI" };
  }
}
