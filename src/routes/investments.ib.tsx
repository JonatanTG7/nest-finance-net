import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowUpDown, MoreVertical, Plus, Wallet, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CashDialog } from "@/components/ib/CashDialog";
import { PositionDialog } from "@/components/ib/PositionDialog";
import {
  fetchIbHoldings,
  fetchIbPositions,
  setIbCash,
  upsertIbPosition,
  deleteIbPosition,
  type IbPosition,
} from "@/lib/ib";
import { getQuotes, type Quote } from "@/lib/ib.functions";
import { fetchUsdIlsRate } from "@/lib/fx";
import { formatMoney, formatILS } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investments/ib")({
  head: () => ({ meta: [{ title: "Interactive Brokers" }] }),
  component: IbPortfolio,
});

type SortKey = "symbol" | "marketValue" | "unrealized";
type CachedQuote = { last: number | null; prevClose: number | null; at: number };
type PositionRow = IbPosition & {
  last: number | null;
  prevClose: number | null;
  stale: boolean;
  marketValue: number | null;
  unrealized: number | null;
  dailyChangeAbs: number | null;
  dailyChangePct: number | null;
};
const QUOTE_CACHE_KEY = "ib.quoteCache.v1";

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
  const getQuotesFn = useServerFn(getQuotes);
  const [cashOpen, setCashOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [editing, setEditing] = useState<IbPosition | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quoteCache, setQuoteCache] = useState<Record<string, CachedQuote>>({});

  useEffect(() => {
    setQuoteCache(loadQuoteCache());
  }, []);

  const { data: holdings } = useQuery({
    queryKey: ["ib", "holdings"],
    queryFn: fetchIbHoldings,
  });
  const { data: positions = [] } = useQuery({
    queryKey: ["ib", "positions"],
    queryFn: fetchIbPositions,
  });
  const { data: fxRate = 3.7 } = useQuery({
    queryKey: ["fx", "usdils"],
    queryFn: fetchUsdIlsRate,
    staleTime: 60 * 60 * 1000,
  });

  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);

  const { data: liveQuotes, isFetching: quotesLoading, refetch: refetchQuotes } = useQuery({
    queryKey: ["ib", "quotes", symbols],
    queryFn: () => getQuotesFn({ data: { symbols } }),
    enabled: symbols.length > 0,
    staleTime: 60_000,
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
        if (q.last != null || q.prevClose != null || !existing) {
          next[q.symbol] = { last, prevClose, at: q.last != null ? now : existing?.at ?? 0 };
        }
      }
      saveQuoteCache(next);
      return next;
    });
  }, [liveQuotes]);

  const rows = useMemo<PositionRow[]>(() => {
    return positions.map((p) => {
      const cached = quoteCache[p.symbol];
      const last = cached?.last ?? null;
      const prevClose = cached?.prevClose ?? null;
      const stale = cached ? Date.now() - cached.at > 5 * 60_000 : true;
      const marketValue = last != null ? last * p.quantity : null;
      const unrealized = last != null ? (last - p.avg_price) * p.quantity : null;
      const dailyChangeAbs =
        last != null && prevClose != null ? (last - prevClose) * p.quantity : null;
      const dailyChangePct =
        last != null && prevClose != null && prevClose !== 0
          ? ((last - prevClose) / prevClose) * 100
          : null;
      return { ...p, last, prevClose, stale, marketValue, unrealized, dailyChangeAbs, dailyChangePct };
    });
  }, [positions, quoteCache]);

  const cash = Number(holdings?.cash_usd ?? 0);
  const totalMarket = rows.reduce((s, r) => s + (r.marketValue ?? 0), 0);
  const totalUnrealized = rows.reduce((s, r) => s + (r.unrealized ?? 0), 0);
  const totalDaily = rows.reduce((s, r) => s + (r.dailyChangeAbs ?? 0), 0);
  const portfolioUsd = cash + totalMarket;
  const portfolioIls = portfolioUsd * fxRate;

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
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const saveCash = useMutation({
    mutationFn: (usd: number) => setIbCash(usd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ib", "holdings"] });
      toast.success("היתרה עודכנה");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה בעדכון היתרה");
    },
  });

  const savePos = useMutation({
    mutationFn: upsertIbPosition,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ib", "positions"] });
      toast.success("נשמר");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה בשמירה");
    },
  });

  const removePos = useMutation({
    mutationFn: deleteIbPosition,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ib", "positions"] });
      toast.success("נמחק");
    },
  });

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Interactive Brokers</h1>
          <p className="text-xs text-muted-foreground">תיק השקעות · USD</p>
        </div>
        <button
          onClick={() => refetchQuotes()}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          title="רענן מחירים"
        >
          <RefreshCw className={cn("size-4", quotesLoading && "animate-spin")} />
        </button>
      </header>

      <section className="px-5 md:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
          <p className="text-sm opacity-80">שווי תיק כולל</p>
          <p className="text-4xl font-bold mt-1 tabular-nums" dir="ltr">
            {formatMoney(portfolioUsd, "USD")}
          </p>
          <p className="text-sm opacity-70 mt-1 tabular-nums">≈ {formatILS(portfolioIls)}</p>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <SummaryStat label="מזומן" value={formatMoney(cash, "USD")} />
            <SummaryStat label="שווי החזקות" value={formatMoney(totalMarket, "USD")} />
            <SummaryStat
              label="P&L לא ממומש"
              value={
                <span className={cn(totalUnrealized >= 0 ? "text-green-500" : "text-red-500")}>
                  {totalUnrealized >= 0 ? "+" : ""}
                  {formatMoney(totalUnrealized, "USD")}
                </span>
              }
            />
            <SummaryStat
              label="שינוי יומי"
              value={
                <span className={cn(totalDaily >= 0 ? "text-green-500" : "text-red-500")}>
                  {totalDaily >= 0 ? "+" : ""}
                  {formatMoney(totalDaily, "USD")}
                </span>
              }
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
                setEditing(null);
                setPosOpen(true);
              }}
            >
              <Plus className="size-4 me-1" />
              הוספת החזקה
            </Button>
          </div>
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4" dir="ltr">
        <div className="rounded-2xl border bg-card overflow-x-auto">

          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b">
                <Th onClick={() => toggleSort("symbol")} active={sortKey === "symbol"} dir={sortDir} align="left">
                  Instrument
                </Th>
                <Th align="right">Position</Th>
                <Th align="right">Avg</Th>
                <Th align="right">Last</Th>
                <Th align="right">Daily</Th>
                <Th onClick={() => toggleSort("unrealized")} active={sortKey === "unrealized"} dir={sortDir} align="right">
                  Unreal. P&amp;L
                </Th>
                <Th onClick={() => toggleSort("marketValue")} active={sortKey === "marketValue"} dir={sortDir} align="right">
                  Market Value
                </Th>
                <Th align="right">Weight</Th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
                    אין החזקות עדיין. לחץ על "הוספת החזקה" כדי להתחיל.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => {
                  const weight = portfolioUsd > 0 && r.marketValue != null
                    ? (r.marketValue / portfolioUsd) * 100
                    : null;
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-3 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{r.symbol}</span>
                          {r.stale && r.last != null && (
                            <WifiOff className="size-3 text-muted-foreground" aria-label="offline price" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {r.avg_price.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.last != null ? r.last.toFixed(2) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right tabular-nums",
                          r.dailyChangeAbs == null
                            ? "text-muted-foreground"
                            : r.dailyChangeAbs >= 0
                            ? "text-green-500"
                            : "text-red-500",
                        )}
                      >
                        {r.dailyChangeAbs == null ? (
                          "—"
                        ) : (
                          <div className="leading-tight">
                            <div>{`${r.dailyChangeAbs >= 0 ? "+" : ""}${r.dailyChangeAbs.toFixed(2)}`}</div>
                            {r.dailyChangePct != null && (
                              <div className="text-[10px] opacity-80">
                                {`${r.dailyChangePct >= 0 ? "+" : ""}${r.dailyChangePct.toFixed(2)}%`}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right tabular-nums font-medium",
                          r.unrealized == null
                            ? "text-muted-foreground"
                            : r.unrealized >= 0
                            ? "text-green-500"
                            : "text-red-500",
                        )}
                      >
                        {r.unrealized == null
                          ? "—"
                          : `${r.unrealized >= 0 ? "+" : ""}${r.unrealized.toFixed(2)}`}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">
                        {r.marketValue != null ? r.marketValue.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {weight != null ? `${weight.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-1 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded hover:bg-accent text-muted-foreground">
                              <MoreVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(r);
                                setPosOpen(true);
                              }}
                            >
                              עריכה
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => removePos.mutate(r.id)}
                            >
                              מחיקה
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2 px-1" dir="rtl">
          מחירים חיים דרך Finnhub עם קאש מקומי. אם ה-API לא זמין נציג את המחיר האחרון שנשמר (
          <WifiOff className="inline size-3" />
          ). הנתונים שהזנת לא נמחקים אף פעם.
        </p>
      </section>

      <CashDialog
        open={cashOpen}
        onOpenChange={setCashOpen}
        currentCash={cash}
        onSave={async (u) => {
          await saveCash.mutateAsync(u);
        }}
      />
      <PositionDialog
        open={posOpen}
        onOpenChange={setPosOpen}
        position={editing}
        onSave={async (v) => {
          await savePos.mutateAsync(v);
        }}
        onDelete={async (id) => {
          await removePos.mutateAsync(id);
        }}
      />
    </AppShell>
  );
}

function Th({
  children,
  align = "left",
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
}) {
  const clickable = !!onClick;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "right" ? "text-right" : "text-left",
        clickable && "cursor-pointer select-none hover:text-foreground",
        active && "text-foreground",
      )}
      onClick={onClick}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {children}
        {clickable && <ArrowUpDown className={cn("size-3 opacity-60", active && "opacity-100")} />}
        {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}


function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs opacity-70">{label}</p>
      <p className="font-semibold tabular-nums mt-0.5" dir="ltr">
        {value}
      </p>
    </div>
  );
}
