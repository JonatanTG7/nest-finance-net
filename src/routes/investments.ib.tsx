import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, Plus, Wallet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CashDialog } from "@/components/ib/CashDialog";
import { BuyDialog } from "@/components/ib/BuyDialog";
import { SellDialog } from "@/components/ib/SellDialog";
import {
  PositionsTable,
  type PositionRowData,
  type PositionSortKey,
} from "@/components/ib/PositionsTable";
import { PortfolioSyncDialog } from "@/components/ib/PortfolioSyncDialog";
import { NewPortfolioDialog } from "@/components/ib/NewPortfolioDialog";
import {
  fetchIbHoldings,
  fetchIbPortfolios,
  fetchIbPositions,
  fetchIbTransactions,
  createIbPortfolio,
  setIbCash,
  buyIbShares,
  sellIbShares,
  deleteIbPosition,
  type IbPosition,
} from "@/lib/ib";
import { getQuotes, type Quote } from "@/lib/ib.functions";
import { useUsdIlsRate } from "@/lib/fx";
import { formatILS } from "@/lib/finance";
import {
  dailyChangePct,
  portfolioTotals,
  positionMarketValue,
  toIls,
  totalRealizedPnl,
  unrealizedPct,
  unrealizedPnl,
} from "@/lib/ib-rules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investments/ib")({
  head: () => ({ meta: [{ title: "Interactive Brokers" }] }),
  validateSearch: (search: Record<string, unknown>): { account?: string } => ({
    account: typeof search.account === "string" ? search.account : undefined,
  }),
  component: IbPortfolio,
});

type MarketPhase = "REGULAR" | "PRE" | "POST" | "CLOSED";
type CachedQuote = {
  last: number | null;
  prevClose: number | null;
  phase: MarketPhase;
  dailyChange: number | null;
  dailyChangePct: number | null;
  at: number;
};
const QUOTE_CACHE_KEY = "ib.quoteCache.v2";

function loadQuoteCache(): Record<string, CachedQuote> {
  try {
    const raw = localStorage.getItem(QUOTE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveQuoteCache(c: Record<string, CachedQuote>) {
  try {
    localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

// IBKR header style: whole numbers, no currency symbol, no "+" prefix —
// green/red carries the sign. Zero reads as green, like in IBKR.
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function pnlClass(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

// IBKR shows cash as "5.62K" in the Cash Balances section.
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const actionBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700";

function IbPortfolio() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { account: accountParam } = Route.useSearch();
  const getQuotesFn = useServerFn(getQuotes);
  const [cashOpen, setCashOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [activePosition, setActivePosition] = useState<IbPosition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IbPosition | null>(null);
  const [sortKey, setSortKey] = useState<PositionSortKey>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tab, setTab] = useState<"positions" | "balances">("positions");
  const [quoteCache, setQuoteCache] = useState<Record<string, CachedQuote>>({});

  useEffect(() => {
    setQuoteCache(loadQuoteCache());
  }, []);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["ib", "portfolios"],
    queryFn: fetchIbPortfolios,
  });
  const selectedId =
    (accountParam && portfolios.some((p) => p.id === accountParam)
      ? accountParam
      : portfolios[0]?.id) ?? null;
  const selectedPortfolio = portfolios.find((p) => p.id === selectedId) ?? null;

  const selectPortfolio = (id: string) => {
    navigate({ to: "/investments/ib", search: { account: id } });
  };

  const { data: holdings } = useQuery({
    queryKey: ["ib", "holdings", selectedId],
    queryFn: () => fetchIbHoldings(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 10_000,
  });
  const { data: positions = [] } = useQuery({
    queryKey: ["ib", "positions", selectedId],
    queryFn: () => fetchIbPositions(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 15_000,
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["ib", "transactions", selectedId],
    queryFn: () => fetchIbTransactions(selectedId!),
    enabled: !!selectedId,
  });
  // No hardcoded fallback rate: when the rate is unavailable the ₪ values
  // show "rate unavailable" instead of a wrong number.
  const { rate: fxRate, stale: fxStale, updatedAt: fxUpdatedAt } = useUsdIlsRate();

  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);

  const {
    data: liveQuotes,
    isFetching: quotesLoading,
    refetch: refetchQuotes,
  } = useQuery({
    queryKey: ["ib", "quotes", symbols],
    queryFn: () => getQuotesFn({ data: { symbols } }),
    enabled: symbols.length > 0,
    staleTime: 5_000,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Merge live quotes into cache; never overwrite a good value with null.
  useEffect(() => {
    if (!liveQuotes || liveQuotes.length === 0) return;
    setQuoteCache((prev) => {
      const next = { ...prev };
      const now = Date.now();
      for (const q of liveQuotes as Quote[]) {
        const existing = next[q.symbol];
        const last = q.last ?? existing?.last ?? null;
        const prevClose = q.prevClose ?? existing?.prevClose ?? null;
        const phase = (q.phase ?? existing?.phase ?? "CLOSED") as MarketPhase;
        const dailyChange = q.dailyChange ?? existing?.dailyChange ?? null;
        const dailyChangePct = q.dailyChangePct ?? existing?.dailyChangePct ?? null;
        if (q.last != null || q.prevClose != null || !existing) {
          next[q.symbol] = {
            last,
            prevClose,
            phase,
            dailyChange,
            dailyChangePct,
            at: q.last != null ? now : (existing?.at ?? 0),
          };
        }
      }
      saveQuoteCache(next);
      return next;
    });
  }, [liveQuotes]);

  const cash = Number(holdings?.cash_usd ?? 0);

  const rows = useMemo<PositionRowData[]>(() => {
    return positions.map((p) => {
      const cached = quoteCache[p.symbol];
      const last = cached?.last ?? null;
      const prevClose = cached?.prevClose ?? null;
      const phase: MarketPhase = cached?.phase ?? "CLOSED";
      const stale = cached ? Date.now() - cached.at > 5 * 60_000 : true;
      // Failsafe: no live/cached price → fall back to cost basis so
      // Market Value & the Total Portfolio never crash to 0. Unrealized P&L
      // is then unknown (null), not zero — see ib-rules.
      const marketValue = positionMarketValue(p.quantity, last, p.avg_price);
      const unrealized = unrealizedPnl(last, p.avg_price, p.quantity);
      const pct = unrealizedPct(last, p.avg_price);
      const perShareChange =
        cached?.dailyChange ?? (last != null && prevClose != null ? last - prevClose : null);
      const dailyChangeAbs = perShareChange != null ? perShareChange * p.quantity : null;
      const dailyChangePct =
        cached?.dailyChangePct ??
        (last != null && prevClose != null && prevClose !== 0
          ? ((last - prevClose) / prevClose) * 100
          : null);
      return {
        id: p.id,
        symbol: p.symbol,
        quantity: p.quantity,
        avgPrice: p.avg_price,
        last,
        phase,
        stale,
        marketValue,
        unrealized,
        unrealizedPct: pct,
        dailyChangeAbs,
        dailyChangePct,
      };
    });
  }, [positions, quoteCache]);

  const totals = useMemo(
    () =>
      portfolioTotals(
        rows.map((r) => ({
          marketValue: r.marketValue,
          unrealized: r.unrealized,
          dailyChangeAbs: r.dailyChangeAbs,
        })),
      ),
    [rows],
  );
  const totalMarket = totals.marketValue;
  const totalUnrealized = totals.unrealized;
  const totalDaily = totals.dailyChange;
  const portfolioUsd = cash + totalMarket;
  const portfolioIls = toIls(portfolioUsd, fxRate);
  const dailyPct = useMemo(
    () => dailyChangePct(totalDaily, portfolioUsd),
    [totalDaily, portfolioUsd],
  );
  const realizedPnlTotal = useMemo(() => totalRealizedPnl(transactions), [transactions]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === "symbol") {
        av = a.symbol;
        bv = b.symbol;
      } else if (sortKey === "marketValue") {
        av = a.marketValue ?? -Infinity;
        bv = b.marketValue ?? -Infinity;
      } else {
        av = a.unrealized ?? -Infinity;
        bv = b.unrealized ?? -Infinity;
      }
      const cmp =
        typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: PositionSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const invalidateIb = () => {
    qc.invalidateQueries({ queryKey: ["ib", "holdings", selectedId] });
    qc.invalidateQueries({ queryKey: ["ib", "positions", selectedId] });
    qc.invalidateQueries({ queryKey: ["ib", "transactions", selectedId] });
    qc.invalidateQueries({ queryKey: ["ib", "holdings", "all"] });
    qc.invalidateQueries({ queryKey: ["ib", "positions", "all"] });
    qc.invalidateQueries({ queryKey: ["investment_accounts"] });
  };

  const saveCash = useMutation({
    mutationFn: async (usd: number) => {
      await setIbCash(selectedId!, usd);
    },
    onSuccess: () => {
      invalidateIb();
      toast.success("Balance updated");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Error updating balance");
    },
  });

  const buyMutation = useMutation({
    mutationFn: buyIbShares,
    onSuccess: () => {
      invalidateIb();
      toast.success("Purchase saved");
    },
    onError: (e: unknown) => {
      console.error(e);
      toast.error(`Error saving purchase: ${(e as Error)?.message ?? "unknown"}`);
    },
  });

  const sellMutation = useMutation({
    mutationFn: sellIbShares,
    onSuccess: () => {
      invalidateIb();
      toast.success("Sale saved");
    },
    onError: (e: unknown) => {
      console.error(e);
      toast.error(`Error saving sale: ${(e as Error)?.message ?? "unknown"}`);
    },
  });

  const removePos = useMutation({
    mutationFn: deleteIbPosition,
    onSuccess: () => {
      invalidateIb();
      toast.success("Deleted");
    },
    onError: () => toast.error("Error deleting"),
  });

  const createPortfolio = useMutation({
    mutationFn: createIbPortfolio,
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["ib", "portfolios"] });
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      toast.success("Portfolio created");
      selectPortfolio(id);
    },
    onError: (e) => {
      console.error(e);
      toast.error("Error creating portfolio");
    },
  });

  const positionById = (id: string) => positions.find((p) => p.id === id) ?? null;

  return (
    <AppShell>
      {/* IBKR-style screen: always dark, English, LTR — even though the rest
          of the app is Hebrew RTL. No yellow anywhere: zinc neutrals with
          green/red only for P&L. */}
      <div
        dir="ltr"
        className="bg-zinc-950 text-zinc-100 md:rounded-2xl md:border md:border-zinc-800 overflow-hidden"
      >
        <header className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Link to="/investments" className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">
              {selectedPortfolio?.name ?? "Interactive Brokers"}
            </h1>
            <p className="text-xs text-zinc-500">Investment Portfolio · USD</p>
          </div>
          <button
            onClick={() => refetchQuotes()}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
            title="Refresh prices"
          >
            <RefreshCw className={cn("size-4", quotesLoading && "animate-spin")} />
          </button>
        </header>

        {portfolios.length > 0 && (
          <section className="px-4 pb-1 flex items-center gap-2 overflow-x-auto">
            {portfolios.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPortfolio(p.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors",
                  p.id === selectedId
                    ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                    : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800",
                )}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setNewPortfolioOpen(true)}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 flex items-center gap-1"
              title="New portfolio"
            >
              <Plus className="size-4" />
              New Portfolio
            </button>
          </section>
        )}

        {!selectedId ? (
          <section className="px-4 py-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm">
              <p className="mb-3">No Interactive Brokers portfolio in this household yet.</p>
              <button
                onClick={() => setNewPortfolioOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
              >
                <Plus className="size-4" />
                Create your first portfolio
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Account header, like the IBKR app: big total value + daily
                change on the left, unrealized/realized P&L on the right. */}
            <section className="px-4 pt-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-4xl font-bold tabular-nums leading-none">
                    {fmtInt(portfolioUsd)}
                  </p>
                  <p className="text-xs text-zinc-500 tabular-nums mt-1.5">
                    {portfolioIls != null ? `≈ ${formatILS(portfolioIls)}` : "ILS rate unavailable"}
                  </p>
                  {fxStale && fxUpdatedAt != null && (
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      Last known rate from {new Date(fxUpdatedAt).toLocaleString("en-US")} —
                      refreshes automatically
                    </p>
                  )}
                  <p
                    className={cn("text-xl font-semibold tabular-nums mt-2", pnlClass(totalDaily))}
                  >
                    {fmtInt(totalDaily)}
                    {dailyPct != null && <span className="ms-3">{fmtPct(dailyPct)}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-sm">
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-zinc-400">Unrealized P&amp;L</span>
                    <span className={cn("font-semibold tabular-nums", pnlClass(totalUnrealized))}>
                      {fmtInt(totalUnrealized)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-6 mt-1">
                    <span className="text-zinc-400">Realized P&amp;L</span>
                    <span className={cn("font-semibold tabular-nums", pnlClass(realizedPnlTotal))}>
                      {fmtInt(realizedPnlTotal)}
                    </span>
                  </div>
                  {!totals.unrealizedKnown && (
                    <p className="text-[11px] text-zinc-500 text-right mt-1">
                      Partial — missing live price
                    </p>
                  )}
                </div>
              </div>
            </section>

            <div className="px-4 mt-4 flex gap-2 flex-wrap">
              <button onClick={() => setCashOpen(true)} className={actionBtnClass}>
                <Wallet className="size-4" />
                Update Cash
              </button>
              <button
                onClick={() => {
                  setActivePosition(null);
                  setBuyOpen(true);
                }}
                className={actionBtnClass}
              >
                <Plus className="size-4" />
                Add Holding
              </button>
              <button onClick={() => setSyncOpen(true)} className={actionBtnClass}>
                <Camera className="size-4" />
                📸 Sync from IBKR
              </button>
            </div>

            {/* No Orders tab: the app has no order data, so no fake UI. */}
            <nav className="px-4 mt-5 flex gap-6 border-b border-zinc-800 text-lg">
              <button
                onClick={() => setTab("positions")}
                className={cn(
                  "pb-2 -mb-px border-b-2",
                  tab === "positions"
                    ? "border-blue-500 text-zinc-100 font-semibold"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                Positions
              </button>
              <button
                onClick={() => setTab("balances")}
                className={cn(
                  "pb-2 -mb-px border-b-2",
                  tab === "balances"
                    ? "border-blue-500 text-zinc-100 font-semibold"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                Balances
              </button>
            </nav>

            {tab === "positions" ? (
              <>
                {sortedRows.length > 0 && (
                  <PositionsTable
                    rows={sortedRows}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggleSort={toggleSort}
                    onBuy={(r) => {
                      setActivePosition(positionById(r.id));
                      setBuyOpen(true);
                    }}
                    onSell={(r) => {
                      setActivePosition(positionById(r.id));
                      setSellOpen(true);
                    }}
                    onDelete={(r) => setDeleteTarget(positionById(r.id))}
                  />
                )}
                <CashBalances cash={cash} />
              </>
            ) : (
              <section className="px-4 py-2">
                <div className="divide-y divide-zinc-800/70">
                  <BalanceRow label="USD Cash" value={fmtUsd(cash)} />
                  <BalanceRow label="Positions Value" value={fmtUsd(totalMarket)} />
                  <BalanceRow label="Net Liquidation Value" value={fmtUsd(portfolioUsd)} bold />
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <CashDialog
        open={cashOpen}
        onOpenChange={setCashOpen}
        currentCash={cash}
        onSave={async (u) => {
          await saveCash.mutateAsync(u);
        }}
      />
      <BuyDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        position={activePosition}
        currentCash={cash}
        onSave={async (v) => {
          await buyMutation.mutateAsync({ ...v, accountId: selectedId! });
        }}
      />
      <SellDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        position={activePosition}
        currentCash={cash}
        onSave={async (v) => {
          if (!activePosition) return;
          await sellMutation.mutateAsync({
            ...v,
            accountId: selectedId!,
            symbol: activePosition.symbol,
          });
        }}
      />
      <PortfolioSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        portfolios={portfolios}
        initialAccountId={selectedId}
        onApplied={invalidateIb}
      />
      <NewPortfolioDialog
        open={newPortfolioOpen}
        onOpenChange={setNewPortfolioOpen}
        existingNames={portfolios.map((p) => p.name)}
        onSave={async (name) => {
          await createPortfolio.mutateAsync(name);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="ltr">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.symbol} entirely?</AlertDialogTitle>
            <AlertDialogDescription>
              The position will be removed from the portfolio. Its buy and sell history stays in the
              journal, but the position itself cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) removePos.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/** Cash section at the bottom of the Positions tab, like the IBKR app. */
function CashBalances({ cash }: { cash: number }) {
  return (
    <section className="mt-2">
      <div className="bg-zinc-800/70 px-4 py-2 text-sm font-medium text-zinc-300">
        Cash Balances
      </div>
      <div className="divide-y divide-zinc-800/70">
        <div className="flex items-baseline justify-between px-4 py-3">
          <span>USD Cash</span>
          <span className="tabular-nums">
            {compactFmt.format(cash)}
            <span className="text-zinc-500 text-sm ms-3">Market Value</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between px-4 py-3">
          <span>Total Cash</span>
          <span className="tabular-nums">
            {compactFmt.format(cash)}
            <span className="text-zinc-500 text-sm ms-3">Market Value</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function BalanceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <span className={cn(bold && "font-semibold")}>{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold")}>{value}</span>
    </div>
  );
}
