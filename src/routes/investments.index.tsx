import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInvestmentAccount } from "@/lib/investment-accounts";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fetchInvestmentAccounts, fetchInvestmentTransactions } from "@/lib/db";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchIbHoldings, fetchIbPositions, IB_ACCOUNT_ID } from "@/lib/ib";
import { getQuotes } from "@/lib/ib.functions";
import { fetchUsdIlsRate } from "@/lib/fx";
import { fetchVouchers } from "@/lib/vouchers";

export const Route = createFileRoute("/investments/")({
  head: () => ({ meta: [{ title: "השקעות וחיסכון — Family Spend" }, { name: "description", content: "חשבונות ההשקעה והחיסכון של משק הבית." }, { property: "og:title", content: "השקעות וחיסכון — Family Spend" }, { property: "og:description", content: "יתרות חשבונות ההשקעה והחיסכון." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Investments,
});

function Investments() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("savings");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [busy, setBusy] = useState(false);
  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createInvestmentAccount({ name, kind, balance: Number(balance || 0), currency });
      await qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      setAdding(false); setName(""); setBalance("");
      toast.success("החשבון נוסף");
    } catch { toast.error("לא הצלחנו להוסיף את החשבון. בדוק את הפרטים ונסה שוב."); }
    finally { setBusy(false); }
  }
  const getQuotesFn = useServerFn(getQuotes);

  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["investments", "txs"],
    queryFn: fetchInvestmentTransactions,
  });
  const { data: ibHoldings } = useQuery({
    queryKey: ["ib", "holdings"],
    queryFn: fetchIbHoldings,
    refetchInterval: 10_000,
  });
  const { data: ibPositions = [] } = useQuery({
    queryKey: ["ib", "positions"],
    queryFn: fetchIbPositions,
    refetchInterval: 15_000,
  });
  const { data: fxRate = 3.7 } = useQuery({
    queryKey: ["fx", "usdils"],
    queryFn: fetchUsdIlsRate,
    staleTime: 60 * 60 * 1000,
  });
  const ibSymbols = useMemo(() => ibPositions.map((p) => p.symbol), [ibPositions]);
  const { data: ibQuotes = [] } = useQuery({
    queryKey: ["ib", "quotes", ibSymbols],
    queryFn: () => getQuotesFn({ data: { symbols: ibSymbols } }),
    enabled: ibSymbols.length > 0,
    staleTime: 5_000,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });

  const ibTotals = useMemo(() => {
    const priceBy = new Map<string, number | null>();
    for (const q of ibQuotes) priceBy.set(q.symbol, q.last);
    const cash = Number(ibHoldings?.cash_usd ?? 0);
    let market = 0;
    for (const p of ibPositions) {
      const last = priceBy.get(p.symbol);
      if (last != null) market += last * Number(p.quantity);
      else market += Number(p.avg_price) * Number(p.quantity);
    }
    const native = cash + market;
    return { native, ils: native * fxRate };
  }, [ibHoldings, ibPositions, ibQuotes, fxRate]);

  const totals = useMemo(() => {
    const m = new Map<string, { native: number; ils: number }>();
    for (const a of accounts) {
      if (a.id === IB_ACCOUNT_ID) {
        m.set(a.id, ibTotals);
        continue;
      }
      m.set(a.id, {
        native: Number(a.starting_balance ?? 0),
        ils: Number(a.starting_balance_ils ?? a.starting_balance ?? 0),
      });
    }
    for (const t of txs) {
      if (!t.investment_account_id) continue;
      if (t.investment_account_id === IB_ACCOUNT_ID) continue;
      const cur = m.get(t.investment_account_id);
      if (!cur) continue;
      cur.native += Number(t.amount);
      cur.ils += Number(t.amount_ils);
    }
    return m;
  }, [txs, accounts, ibTotals]);

  const { data: vouchers = [] } = useQuery({
    queryKey: ["vouchers"],
    queryFn: fetchVouchers,
  });
  const voucherTotals = useMemo(
    () => ({
      count: vouchers.length,
      remaining: vouchers.reduce((a, v) => a + Number(v.remaining_value), 0),
    }),
    [vouchers],
  );

  const grandIls = useMemo(
    () => Array.from(totals.values()).reduce((a, b) => a + b.ils, 0),
    [totals],
  );

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap"><h1 className="text-2xl font-bold">השקעות וחיסכון</h1><Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />חשבון חדש</Button></div>
        <p className="text-sm text-muted-foreground mt-1">
          לחץ על כל חשבון כדי לעדכן את הסכום ולראות את היסטוריית השינויים.
        </p>
      </header>

      <section className="px-5 md:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
          <p className="text-sm opacity-80">סך נכסים (ש"ח)</p>
          <p className="text-4xl font-bold mt-2 tabular-nums">{formatILS(grandIls)}</p>
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {accounts.map((a) => {
          const t = totals.get(a.id) ?? { native: 0, ils: 0 };
          const isIb = a.id === IB_ACCOUNT_ID;
          const card = (
            <div className="rounded-2xl border bg-card p-4 h-full">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: a.color }} />
                <p className="text-sm font-semibold">{a.name}</p>
                <span className="ms-auto text-xs text-muted-foreground">{a.currency}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </div>
              <p
                className="text-2xl font-bold mt-2 tabular-nums"
                dir={a.currency !== "ILS" ? "ltr" : undefined}
              >
                {formatMoney(t.native, a.currency)}
              </p>
              {a.currency !== "ILS" && (
                <p className="text-xs text-muted-foreground tabular-nums">≈ {formatILS(t.ils)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {isIb ? `${ibPositions.length} החזקות · מחירים חיים` : "עדכון סכום והיסטוריה"}
              </p>
            </div>
          );
          return isIb ? (
            <Link
              key={a.id}
              to="/investments/ib"
              className="block active:scale-[0.99] transition-transform"
            >
              {card}
            </Link>
          ) : (
            <Link
              key={a.id}
              to="/investments/$accountId"
              params={{ accountId: a.id }}
              className="block active:scale-[0.99] transition-transform"
            >
              {card}
            </Link>
          );
        })}

        <Link to="/investments/vouchers" className="block active:scale-[0.99] transition-transform">
          <div className="rounded-2xl border bg-card p-4 h-full">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary" />
              <p className="text-sm font-semibold">שוברים</p>
              <span className="ms-auto text-xs text-muted-foreground">ILS</span>
              <ChevronLeft className="size-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2 tabular-nums">
              {formatILS(voucherTotals.remaining)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {voucherTotals.count} שוברים · {formatILS(voucherTotals.remaining)} יתרה
            </p>
          </div>
        </Link>
      </section>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>חשבון חדש</DialogTitle></DialogHeader>
          <form onSubmit={addAccount} className="space-y-4">
            <label className="block text-sm">שם החשבון<Input aria-label="שם החשבון" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
            <label className="block text-sm">סוג חשבון<select aria-label="סוג חשבון" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full h-10 border rounded-md bg-background px-3"><option value="savings">חיסכון / פיקדון</option><option value="investment">השקעה</option><option value="pension">פנסיה</option><option value="provident">קופת גמל / השתלמות</option></select></label>
            <label className="block text-sm">מטבע<select aria-label="מטבע" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full h-10 border rounded-md bg-background px-3">{["ILS", "USD"].map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="block text-sm">יתרה התחלתית<Input aria-label="יתרה התחלתית" type="number" min="0" step="0.01" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" /></label>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "שומר…" : "הוסף חשבון"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
