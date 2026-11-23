import { IB_KIND } from "@/lib/ib";
import { computeAccountTotals } from "@/lib/account-totals";
import { isSharedAccount } from "@/lib/private-accounts";

/**
 * Net-worth computation, shared by the assets page and the email digest
 * sender so the digest can never drift from the app's own totals.
 *
 * The pieces:
 * - Non-IB accounts come from the shared rule in lib/account-totals
 *   (starting balance + transactions after the last manual balance
 *   reset + post-reset journal P&L; the reset absorbs earlier rows
 *   into the baseline).
 * - IB portfolios are valued here from live positions (last price,
 *   falling back to avg_price when no quote) plus cash — never from
 *   transactions — and overlaid onto the account totals.
 * - When the USD→ILS rate is unavailable, IB value is excluded from
 *   the ILS total (null) instead of guessed — the caller flags it.
 * - Private accounts (a person's pension, study fund, ...) NEVER count
 *   toward a grand total — grandTotalIlsShared is the one place that
 *   enforces it, used by both the assets page and computeNetWorth.
 *   They live only on their owner's tab. Per-account totals maps still
 *   cover every account (the person cards need them); only the grand
 *   total is filtered.
 *
 * Inputs are structural on purpose: both Supabase rows (client + server)
 * and test fixtures satisfy them.
 */

export interface NetWorthAccountInput {
  id: string;
  kind: string;
  currency: string;
  starting_balance: number | null;
  starting_balance_ils: number | null;
  balance_reset_at: string | null;
  /** Owner slot; missing counts as shared (pre-migration rows). */
  person?: string | null;
}

export interface NetWorthTransactionInput {
  investment_account_id: string | null;
  amount: number;
  amount_ils: number;
  created_at: string | null;
}

export interface NetWorthJournalInput {
  investment_account_id: string;
  pnl_usd: number;
  // created_at is NOT NULL in the DB (defaults to now()).
  created_at: string;
}

export interface IbHoldingInput {
  investment_account_id: string;
  cash_usd: number;
}

export interface IbPositionInput {
  investment_account_id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
}

export interface QuoteInput {
  symbol: string;
  last: number | null;
}

export interface IbTotal {
  native: number;
  /** Null when the FX rate is unavailable — never a guessed number. */
  ils: number | null;
  count: number;
}

export interface AccountTotal {
  native: number;
  /** Null for IB portfolios when the FX rate is unavailable. */
  ils: number | null;
}

/** Per-portfolio IB totals (cash + live positions), keyed by account id. */
export function computeIbTotals(
  holdings: IbHoldingInput[],
  positions: IbPositionInput[],
  quotes: QuoteInput[],
  fxRate: number | null,
): Map<string, IbTotal> {
  const priceBy = new Map<string, number | null>();
  for (const q of quotes) priceBy.set(q.symbol, q.last);
  const m = new Map<string, IbTotal>();
  const cashBy = new Map<string, number>();
  for (const h of holdings) cashBy.set(h.investment_account_id, Number(h.cash_usd ?? 0));
  const positionsBy = new Map<string, IbPositionInput[]>();
  for (const p of positions) {
    const arr = positionsBy.get(p.investment_account_id) ?? [];
    arr.push(p);
    positionsBy.set(p.investment_account_id, arr);
  }
  for (const [accountId, ps] of positionsBy) {
    let market = 0;
    for (const p of ps) {
      const last = priceBy.get(p.symbol);
      if (last != null) market += last * Number(p.quantity);
      else market += Number(p.avg_price) * Number(p.quantity);
    }
    const native = (cashBy.get(accountId) ?? 0) + market;
    m.set(accountId, {
      native,
      ils: fxRate != null ? native * fxRate : null,
      count: ps.length,
    });
  }
  // Portfolios with cash but no positions yet still get a total.
  for (const [accountId, cash] of cashBy) {
    if (!m.has(accountId)) {
      m.set(accountId, { native: cash, ils: fxRate != null ? cash * fxRate : null, count: 0 });
    }
  }
  return m;
}

/**
 * Grand total in ILS. The total mixes live FX (IB) with frozen historical
 * rates (other accounts) — an inherent limitation of the model. When the
 * FX rate is unavailable, IB value is excluded and `ibIlsMissing` is true
 * so the caller can flag it instead of showing a silently partial total.
 */
export function grandTotalIls(totals: Map<string, AccountTotal>): {
  grandIls: number;
  ibIlsMissing: boolean;
} {
  const ibIlsMissing = Array.from(totals.values()).some((t) => t.ils == null);
  const grandIls = Array.from(totals.values()).reduce((a, b) => a + (b.ils ?? 0), 0);
  return { grandIls, ibIlsMissing };
}

/**
 * Grand total over SHARED accounts only — the one place that keeps
 * private accounts out of every household total. The assets page and
 * computeNetWorth both go through here, so the two totals cannot drift
 * apart. A totals entry with no matching account row is dropped (it
 * cannot be proven shared); IB portfolios always count as shared.
 */
export function grandTotalIlsShared(
  totals: Map<string, AccountTotal>,
  accounts: { id: string; person?: string | null; kind: string }[],
): { grandIls: number; ibIlsMissing: boolean } {
  const sharedIds = new Set(accounts.filter(isSharedAccount).map((a) => a.id));
  const shared = new Map([...totals].filter(([id]) => sharedIds.has(id)));
  return grandTotalIls(shared);
}

/**
 * Shared-accounts net worth: non-IB totals from the shared rule, IB
 * portfolios overlaid from live positions, plus the grand ILS total
 * over shared accounts only (private accounts never count — see
 * grandTotalIlsShared). This is the same composition the assets page
 * renders — the digest sender uses it so both sides can never disagree.
 * The returned per-account totals map still covers every account; only
 * the grand total is filtered.
 */
export function computeNetWorth(input: {
  accounts: NetWorthAccountInput[];
  transactions: NetWorthTransactionInput[];
  journalEntries: NetWorthJournalInput[];
  ibHoldings: IbHoldingInput[];
  ibPositions: IbPositionInput[];
  quotes: QuoteInput[];
  fxRate: number | null;
}): { totals: Map<string, AccountTotal>; grandIls: number; ibIlsMissing: boolean } {
  const ibTotals = computeIbTotals(input.ibHoldings, input.ibPositions, input.quotes, input.fxRate);
  const totals: Map<string, AccountTotal> = computeAccountTotals({
    // The shared rule's inputs are non-nullable starting balances;
    // normalize here so a null starting balance still means zero.
    accounts: input.accounts.map((a) => ({
      ...a,
      starting_balance: a.starting_balance ?? 0,
      starting_balance_ils: a.starting_balance_ils ?? 0,
    })),
    transactions: input.transactions,
    journalEntries: input.journalEntries,
    fxRate: input.fxRate,
  });
  for (const a of input.accounts) {
    if (a.kind === IB_KIND) {
      const t = ibTotals.get(a.id);
      totals.set(a.id, { native: t?.native ?? 0, ils: t?.ils ?? null });
    }
  }
  const { grandIls, ibIlsMissing } = grandTotalIlsShared(totals, input.accounts);
  return { totals, grandIls, ibIlsMissing };
}
