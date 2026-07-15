import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MoreVertical, Plus, Wallet, RefreshCw } from "lucide-react";
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
import { getQuotes } from "@/lib/ib.functions";
import { fetchUsdIlsRate } from "@/lib/fx";
import { formatMoney, formatILS } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investments/ib")({
  head: () => ({ meta: [{ title: "Interactive Brokers" }] }),
  component: IbPortfolio,
});

function IbPortfolio() {
  const qc = useQueryClient();
  const getQuotesFn = useServerFn(getQuotes);
  const [cashOpen, setCashOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [editing, setEditing] = useState<IbPosition | null>(null);

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

  const { data: quotes = [], isFetching: quotesLoading, refetch: refetchQuotes } = useQuery({
    queryKey: ["ib", "quotes", symbols],
    queryFn: () => getQuotesFn({ data: { symbols } }),
    enabled: symbols.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const priceBySymbol = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const q of quotes) m.set(q.symbol, q.last);
    return m;
  }, [quotes]);

  const rows = useMemo(() => {
    return positions.map((p) => {
      const last = priceBySymbol.get(p.symbol) ?? null;
      const marketValue = last != null ? last * p.quantity : null;
      const unrealized = last != null ? (last - p.avg_price) * p.quantity : null;
      return { ...p, last, marketValue, unrealized };
    });
  }, [positions, priceBySymbol]);

  const cash = Number(holdings?.cash_usd ?? 0);
  const totalMarket = rows.reduce((s, r) => s + (r.marketValue ?? 0), 0);
  const totalUnrealized = rows.reduce((s, r) => s + (r.unrealized ?? 0), 0);
  const portfolioUsd = cash + totalMarket;
  const portfolioIls = portfolioUsd * fxRate;

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

          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <SummaryStat label="מזומן" value={formatMoney(cash, "USD")} />
            <SummaryStat
              label="רווח/הפסד לא ממומש"
              value={
                <span className={cn(totalUnrealized >= 0 ? "text-green-600" : "text-red-600")}>
                  {totalUnrealized >= 0 ? "+" : ""}
                  {formatMoney(totalUnrealized, "USD")}
                </span>
              }
            />
            <SummaryStat label="שווי החזקות" value={formatMoney(totalMarket, "USD")} />
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

      <section className="px-5 md:px-0 mt-4">
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
            <div>Instrument</div>
            <div className="text-end">Position</div>
            <div className="text-end">Last</div>
            <div className="text-end">Avg</div>
            <div className="text-end">Unreal. P&L</div>
            <div className="text-end">Market Value</div>
            <div />
          </div>
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              אין החזקות עדיין. לחץ על "הוספת החזקה" כדי להתחיל.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 px-4 py-3 items-center border-b last:border-b-0 text-sm"
              >
                <div className="font-semibold" dir="ltr">
                  {r.symbol}
                </div>
                <div className="text-end tabular-nums" dir="ltr">
                  {r.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </div>
                <div className="text-end tabular-nums" dir="ltr">
                  {r.last != null ? r.last.toFixed(2) : "—"}
                </div>
                <div className="text-end tabular-nums text-muted-foreground" dir="ltr">
                  {r.avg_price.toFixed(2)}
                </div>
                <div
                  className={cn(
                    "text-end tabular-nums font-medium",
                    r.unrealized == null
                      ? "text-muted-foreground"
                      : r.unrealized >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                  dir="ltr"
                >
                  {r.unrealized == null
                    ? "—"
                    : `${r.unrealized >= 0 ? "+" : ""}${r.unrealized.toFixed(2)}`}
                </div>
                <div className="text-end tabular-nums font-semibold" dir="ltr">
                  {r.marketValue != null ? r.marketValue.toFixed(2) : "—"}
                </div>
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
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          מחירים חיים דרך Finnhub. הרווח/הפסד מחושב כ- (מחיר אחרון − מחיר קנייה) × כמות.
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
