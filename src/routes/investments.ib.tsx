import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, History, Plus, Wallet, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
import { PositionHistoryDialog } from "@/components/ib/PositionHistoryDialog";
import {
  PositionsTable,
  type PositionRowData,
  type PositionSortKey,
} from "@/components/ib/PositionsTable";
import { PortfolioSyncDialog } from "@/components/ib/PortfolioSyncDialog";
import { NewPortfolioDialog } from "@/components/ib/NewPortfolioDialog";
import { BalanceHistoryList } from "@/components/investments/BalanceHistoryList";
import { fetchBalanceHistory } from "@/lib/balance_history";
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
import { formatMoney, formatILS } from "@/lib/finance";
import {
  portfolioTotals,
  positionCostBasis,
  positionMarketValue,
  toIls,
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

function IbPortfolio() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { account: accountParam } = Route.useSearch();
  const getQuotesFn = useServerFn(getQuotes);
  const [cashOpen, setCashOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [activePosition, setActivePosition] = useState<IbPosition | null>(null);
  const [historySymbol, setHistorySymbol] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IbPosition | null>(null);
  const [sortKey, setSortKey] = useState<PositionSortKey>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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

  const { data: history = [] } = useQuery({
    queryKey: ["balance_history", selectedId],
    queryFn: () => fetchBalanceHistory(selectedId!),
    enabled: !!selectedId,
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
  const totalCostBasis = useMemo(
    () => rows.reduce((s, r) => s + positionCostBasis(r.quantity, r.avgPrice), 0),
    [rows],
  );
  const totalMarket = totals.marketValue;
  const totalUnrealized = totals.unrealized;
  const totalDaily = totals.dailyChange;
  const portfolioUsd = cash + totalMarket;
  const portfolioIls = toIls(portfolioUsd, fxRate);
  const realizedPnlTotal = useMemo(() => {
    let sum = 0;
    for (const t of transactions) {
      if (t.kind === "sell" && t.prior_avg_price != null) {
        sum += (t.price - t.prior_avg_price) * t.quantity;
      }
    }
    return sum;
  }, [transactions]);

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
    qc.invalidateQueries({ queryKey: ["balance_history", selectedId] });
    qc.invalidateQueries({ queryKey: ["investment_accounts"] });
  };

  const saveCash = useMutation({
    mutationFn: async (usd: number) => {
      await setIbCash(selectedId!, usd);
    },
    onSuccess: () => {
      invalidateIb();
      toast.success("היתרה עודכנה");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה בעדכון היתרה");
    },
  });

  const buyMutation = useMutation({
    mutationFn: buyIbShares,
    onSuccess: () => {
      invalidateIb();
      toast.success("הקנייה נשמרה");
    },
    onError: (e: unknown) => {
      console.error(e);
      toast.error(`שגיאה בשמירת הקנייה: ${(e as Error)?.message ?? "לא ידועה"}`);
    },
  });

  const sellMutation = useMutation({
    mutationFn: sellIbShares,
    onSuccess: () => {
      invalidateIb();
      toast.success("המכירה נשמרה");
    },
    onError: (e: unknown) => {
      console.error(e);
      toast.error(`שגיאה בשמירת המכירה: ${(e as Error)?.message ?? "לא ידועה"}`);
    },
  });

  const removePos = useMutation({
    mutationFn: deleteIbPosition,
    onSuccess: () => {
      invalidateIb();
      toast.success("נמחק");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  const createPortfolio = useMutation({
    mutationFn: createIbPortfolio,
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["ib", "portfolios"] });
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      toast.success("התיק נוצר");
      selectPortfolio(id);
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה ביצירת התיק");
    },
  });

  const positionById = (id: string) => positions.find((p) => p.id === id) ?? null;

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {selectedPortfolio?.name ?? "Interactive Brokers"}
          </h1>
          <p className="text-xs text-muted-foreground">תיק השקעות · USD</p>
        </div>
        <button
          onClick={() => {
            setHistorySymbol(null);
            setHistoryOpen(true);
          }}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          title="היסטוריית תנועות"
        >
          <History className="size-4" />
        </button>
        <button
          onClick={() => refetchQuotes()}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          title="רענן מחירים"
        >
          <RefreshCw className={cn("size-4", quotesLoading && "animate-spin")} />
        </button>
      </header>

      {portfolios.length > 0 && (
        <section className="px-5 md:px-0 pb-1 flex items-center gap-2 overflow-x-auto">
          {portfolios.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPortfolio(p.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors",
                p.id === selectedId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent",
              )}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() => setNewPortfolioOpen(true)}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border bg-card hover:bg-accent flex items-center gap-1"
            title="תיק מסחר חדש"
          >
            <Plus className="size-4" />
            תיק חדש
          </button>
        </section>
      )}

      {!selectedId ? (
        <section className="px-5 md:px-0 mt-4">
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <p className="mb-3">עדיין אין תיק Interactive Brokers במשק הבית.</p>
            <Button size="sm" onClick={() => setNewPortfolioOpen(true)}>
              <Plus className="size-4 me-1" />
              צור תיק ראשון
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="px-5 md:px-0">
            <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
              <p className="text-sm opacity-80">שווי תיק כולל</p>
              <p className="text-4xl font-bold mt-1 tabular-nums" dir="ltr">
                {formatMoney(portfolioUsd, "USD")}
              </p>
              <p className="text-xl font-bold mt-1 tabular-nums">
                {portfolioIls != null ? formatILS(portfolioIls) : "שער דולר לא זמין"}
              </p>
              {fxStale && fxUpdatedAt != null && (
                <p className="text-xs opacity-70 mt-1">
                  שער אחרון ידוע מ־{new Date(fxUpdatedAt).toLocaleString("he-IL")} — יתרענן אוטומטית
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <SummaryStat label="מזומן" usd={cash} ils={toIls(cash, fxRate)} currency="USD" />
                <SummaryStat
                  label="שווי החזקות"
                  usd={totalMarket}
                  ils={toIls(totalMarket, fxRate)}
                  currency="USD"
                />
                <SummaryStat
                  label="P&L לא ממומש"
                  usd={totalUnrealized}
                  ils={toIls(totalUnrealized, fxRate)}
                  currency="USD"
                  colored
                  note={!totals.unrealizedKnown ? "חלקי — חסר מחיר חי" : undefined}
                />
                <SummaryStat
                  label="P&L ממומש"
                  usd={realizedPnlTotal}
                  ils={toIls(realizedPnlTotal, fxRate)}
                  currency="USD"
                  colored
                />
                <SummaryStat
                  label="שינוי יומי"
                  usd={totalDaily}
                  ils={toIls(totalDaily, fxRate)}
                  currency="USD"
                  colored
                />
              </div>

              <div className="mt-5 flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => setCashOpen(true)}>
                  <Wallet className="size-4 me-1" />
                  עדכון מזומן
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setActivePosition(null);
                    setBuyOpen(true);
                  }}
                >
                  <Plus className="size-4 me-1" />
                  הוספת החזקה
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSyncOpen(true)}>
                  <Camera className="size-4 me-1" />
                  📸 סנכרן מ-IBKR
                </Button>
              </div>
            </div>
          </section>

          <section className="px-5 md:px-0 mt-4">
            {sortedRows.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
                אין החזקות עדיין. לחץ על "הוספת החזקה" כדי להתחיל, או על "סנכרן מ-IBKR" כדי לייבא
                מצילום מסך.
              </div>
            ) : (
              <PositionsTable
                rows={sortedRows}
                fxRate={fxRate}
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
                onHistory={(r) => {
                  setHistorySymbol(r.symbol);
                  setHistoryOpen(true);
                }}
                onDelete={(r) => setDeleteTarget(positionById(r.id))}
                totals={{
                  marketValue: totalMarket,
                  unrealized: totalUnrealized,
                  unrealizedKnown: totals.unrealizedKnown,
                  dailyChange: totalDaily,
                  costBasis: totalCostBasis,
                }}
              />
            )}
          </section>
          <p className="text-xs text-muted-foreground mt-2 px-5 md:px-0">
            המחירים מתעדכנים אוטומטית כל כמה שניות עם קאש מקומי. אם ה-API לא זמין נציג את המחיר
            האחרון שנשמר (
            <WifiOff className="inline size-3" />
            ). קנייה ומכירה דרך הדיאלוגים עם הזנת כמות. הנתונים שהזנת (כמות ומחיר ממוצע) לא נמחקים
            אף פעם.
          </p>

          <BalanceHistoryList rows={history} />
        </>
      )}

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
      <PositionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        initialSymbol={historySymbol}
        accountId={selectedId ?? ""}
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
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקה מלאה של {deleteTarget?.symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              ההחזקה תימחק מהתיק. היסטוריית הקניות והמכירות שלה תישאר ביומן, אבל לא ניתן לשחזר את
              ההחזקה עצמה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) removePos.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function SummaryStat({
  label,
  usd,
  ils,
  currency,
  colored,
  note,
}: {
  label: string;
  usd: number;
  ils: number | null;
  currency: "USD";
  colored?: boolean;
  note?: string;
}) {
  return (
    <div>
      <p className="text-xs opacity-70">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums mt-0.5",
          colored && (usd >= 0 ? "text-green-500" : "text-red-500"),
        )}
        dir="ltr"
      >
        {colored && usd >= 0 ? "+" : ""}
        {formatMoney(usd, currency)}
      </p>
      <p className="text-xs opacity-70 tabular-nums">
        {ils != null ? `${colored && ils >= 0 ? "+" : ""}${formatILS(ils)}` : "שער ₪ לא זמין"}
      </p>
      {note && <p className="text-[10px] opacity-60 mt-0.5">{note}</p>}
    </div>
  );
}
