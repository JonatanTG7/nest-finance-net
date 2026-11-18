import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronUp, Eye, EyeOff, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInvestmentAccount } from "@/lib/investment-accounts";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fetchInvestmentAccounts, fetchInvestmentTransactions } from "@/lib/db";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchAllIbHoldings, fetchAllIbPositions, IB_KIND } from "@/lib/ib";
import { getQuotes } from "@/lib/ib.functions";
import { useUsdIlsRate } from "@/lib/fx";
import { fetchVouchers } from "@/lib/vouchers";
import { privacyBlurClass, usePrivacyMode } from "@/lib/privacy";
import { useCardOrder, VOUCHERS_CARD_ID } from "@/lib/investments-order";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investments/")({
  head: () => ({
    meta: [
      { title: "נכסים — Family Spend" },
      { name: "description", content: "חשבונות ההשקעה והחיסכון של משק הבית." },
      { property: "og:title", content: "נכסים — Family Spend" },
      { property: "og:description", content: "יתרות חשבונות ההשקעה והחיסכון." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Investments,
});

function Investments() {
  const qc = useQueryClient();
  const { blurred, toggle: togglePrivacy } = usePrivacyMode();
  const [editingOrder, setEditingOrder] = useState(false);
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
      setAdding(false);
      setName("");
      setBalance("");
      toast.success("החשבון נוסף");
    } catch {
      toast.error("לא הצלחנו להוסיף את החשבון. בדוק את הפרטים ונסה שוב.");
    } finally {
      setBusy(false);
    }
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
  const { data: ibHoldings = [] } = useQuery({
    queryKey: ["ib", "holdings", "all"],
    queryFn: fetchAllIbHoldings,
    refetchInterval: 10_000,
  });
  const { data: ibPositions = [] } = useQuery({
    queryKey: ["ib", "positions", "all"],
    queryFn: fetchAllIbPositions,
    refetchInterval: 15_000,
  });
  // No hardcoded fallback rate: when the rate is unavailable the ₪ values of
  // IB portfolios are shown as "rate unavailable" instead of a wrong number.
  const { rate: fxRate } = useUsdIlsRate();
  const ibSymbols = useMemo(
    () => Array.from(new Set(ibPositions.map((p) => p.symbol))),
    [ibPositions],
  );
  const { data: ibQuotes = [] } = useQuery({
    queryKey: ["ib", "quotes", ibSymbols],
    queryFn: () => getQuotesFn({ data: { symbols: ibSymbols } }),
    enabled: ibSymbols.length > 0,
    staleTime: 5_000,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });

  // Per-portfolio IB totals (cash + live positions), keyed by account id.
  const ibTotals = useMemo(() => {
    const priceBy = new Map<string, number | null>();
    for (const q of ibQuotes) priceBy.set(q.symbol, q.last);
    const m = new Map<string, { native: number; ils: number | null; count: number }>();
    const cashBy = new Map<string, number>();
    for (const h of ibHoldings) cashBy.set(h.investment_account_id, Number(h.cash_usd ?? 0));
    const positionsBy = new Map<string, typeof ibPositions>();
    for (const p of ibPositions) {
      const arr = positionsBy.get(p.investment_account_id) ?? [];
      arr.push(p);
      positionsBy.set(p.investment_account_id, arr);
    }
    for (const [accountId, positions] of positionsBy) {
      let market = 0;
      for (const p of positions) {
        const last = priceBy.get(p.symbol);
        if (last != null) market += last * Number(p.quantity);
        else market += Number(p.avg_price) * Number(p.quantity);
      }
      const native = (cashBy.get(accountId) ?? 0) + market;
      m.set(accountId, {
        native,
        ils: fxRate != null ? native * fxRate : null,
        count: positions.length,
      });
    }
    // Portfolios with cash but no positions yet still get a total.
    for (const [accountId, cash] of cashBy) {
      if (!m.has(accountId)) {
        m.set(accountId, { native: cash, ils: fxRate != null ? cash * fxRate : null, count: 0 });
      }
    }
    return m;
  }, [ibHoldings, ibPositions, ibQuotes, fxRate]);

  const totals = useMemo(() => {
    const m = new Map<string, { native: number; ils: number | null }>();
    for (const a of accounts) {
      if (a.kind === IB_KIND) {
        const t = ibTotals.get(a.id);
        m.set(a.id, { native: t?.native ?? 0, ils: t?.ils ?? null });
        continue;
      }
      m.set(a.id, {
        native: Number(a.starting_balance ?? 0),
        ils: Number(a.starting_balance_ils ?? a.starting_balance ?? 0),
      });
    }
    for (const t of txs) {
      if (!t.investment_account_id) continue;
      const account = accounts.find((a) => a.id === t.investment_account_id);
      // IB portfolios are valued from live positions, never from transactions.
      if (!account || account.kind === IB_KIND) continue;
      // After a manual balance reset, only transactions created after the
      // reset count toward the balance — older ones stay in history.
      if (
        account.balance_reset_at &&
        t.created_at &&
        new Date(t.created_at).getTime() <= new Date(account.balance_reset_at).getTime()
      ) {
        continue;
      }
      const cur = m.get(t.investment_account_id);
      if (!cur) continue;
      cur.native += Number(t.amount);
      cur.ils = (cur.ils ?? 0) + Number(t.amount_ils);
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

  // Card order (accounts + vouchers card), saved per device. The grand
  // total card stays fixed at the top and is not part of the order.
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cardIds = useMemo(() => [...accounts.map((a) => a.id), VOUCHERS_CARD_ID], [accounts]);
  const { orderedIds, move } = useCardOrder(cardIds);

  // The grand total mixes live FX (IB) with frozen historical rates (other
  // accounts) — an inherent limitation of the model. When the FX rate is
  // unavailable, IB value is excluded and flagged instead of guessed.
  const ibIlsMissing = Array.from(totals.values()).some((t) => t.ils == null);
  const grandIls = useMemo(
    () => Array.from(totals.values()).reduce((a, b) => a + (b.ils ?? 0), 0),
    [totals],
  );

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">נכסים</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={togglePrivacy}
              aria-label={blurred ? "הצג סכומים" : "הסתר סכומים"}
              title={blurred ? "הצג סכומים" : "הסתר סכומים"}
            >
              {blurred ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingOrder((v) => !v)}
              aria-pressed={editingOrder}
            >
              {editingOrder ? (
                "סיום"
              ) : (
                <>
                  <GripVertical className="size-4" />
                  סדר כרטיסים
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              חשבון חדש
            </Button>
          </div>
        </div>
      </header>

      <section className="px-5 md:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
          <p className="text-sm opacity-80">סך נכסים (ש"ח)</p>
          <p className={cn("text-4xl font-bold mt-2 tabular-nums", privacyBlurClass(blurred))}>
            {formatILS(grandIls)}
          </p>
          {ibIlsMissing && (
            <p className="text-xs opacity-70 mt-1">
              שער הדולר לא זמין כרגע — שווי תיקי ה-IB לא נכלל בסך הזה.
            </p>
          )}
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {orderedIds.map((id, index) => {
          if (id === VOUCHERS_CARD_ID) {
            const card = (
              <div
                className={cn(
                  "rounded-2xl border bg-card p-4 h-full",
                  editingOrder && "ring-2 ring-primary/50",
                )}
              >
                <div className="flex items-center gap-2">
                  {editingOrder && <GripVertical className="size-4 text-muted-foreground" />}
                  <span className="size-3 rounded-full bg-primary" />
                  <p className="text-sm font-semibold">שוברים</p>
                  <span className="ms-auto text-xs text-muted-foreground">ILS</span>
                  {!editingOrder && <ChevronLeft className="size-4 text-muted-foreground" />}
                </div>
                <p
                  className={cn("text-2xl font-bold mt-2 tabular-nums", privacyBlurClass(blurred))}
                >
                  {formatILS(voucherTotals.remaining)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {voucherTotals.count} שוברים ·{" "}
                  <span className={privacyBlurClass(blurred)}>
                    {formatILS(voucherTotals.remaining)}
                  </span>{" "}
                  יתרה
                </p>
                {editingOrder && (
                  <ReorderControls
                    onUp={() => move(id, "up")}
                    onDown={() => move(id, "down")}
                    disableUp={index === 0}
                    disableDown={index === orderedIds.length - 1}
                  />
                )}
              </div>
            );
            return editingOrder ? (
              <div key={id}>{card}</div>
            ) : (
              <Link
                key={id}
                to="/investments/vouchers"
                className="block active:scale-[0.99] transition-transform"
              >
                {card}
              </Link>
            );
          }

          const a = accountById.get(id);
          if (!a) return null;
          const t = totals.get(a.id) ?? { native: 0, ils: 0 };
          const isIb = a.kind === IB_KIND;
          const ibCount = isIb ? (ibTotals.get(a.id)?.count ?? 0) : 0;
          const card = (
            <div
              className={cn(
                "rounded-2xl border bg-card p-4 h-full",
                editingOrder && "ring-2 ring-primary/50",
              )}
            >
              <div className="flex items-center gap-2">
                {editingOrder && <GripVertical className="size-4 text-muted-foreground" />}
                <span className="size-3 rounded-full" style={{ background: a.color }} />
                <p className="text-sm font-semibold">{a.name}</p>
                <span className="ms-auto text-xs text-muted-foreground">{a.currency}</span>
                {!editingOrder && <ChevronLeft className="size-4 text-muted-foreground" />}
              </div>
              <p
                className={cn("text-2xl font-bold mt-2 tabular-nums", privacyBlurClass(blurred))}
                dir={a.currency !== "ILS" ? "ltr" : undefined}
              >
                {formatMoney(t.native, a.currency)}
              </p>
              {a.currency !== "ILS" && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t.ils != null ? (
                    <>
                      ≈ <span className={privacyBlurClass(blurred)}>{formatILS(t.ils)}</span>
                    </>
                  ) : (
                    "שער דולר לא זמין"
                  )}
                </p>
              )}
              {isIb && <p className="text-xs text-muted-foreground mt-1">{ibCount} החזקות</p>}
              {editingOrder && (
                <ReorderControls
                  onUp={() => move(id, "up")}
                  onDown={() => move(id, "down")}
                  disableUp={index === 0}
                  disableDown={index === orderedIds.length - 1}
                />
              )}
            </div>
          );
          // In reorder mode the cards are plain divs — tapping must not
          // navigate while the user is rearranging.
          if (editingOrder) return <div key={a.id}>{card}</div>;
          return isIb ? (
            <Link
              key={a.id}
              to="/investments/ib"
              search={{ account: a.id }}
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
      </section>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>חשבון חדש</DialogTitle>
          </DialogHeader>
          <form onSubmit={addAccount} className="space-y-4">
            <label className="block text-sm">
              שם החשבון
              <Input
                aria-label="שם החשבון"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label className="block text-sm">
              סוג חשבון
              <select
                aria-label="סוג חשבון"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full h-10 border rounded-md bg-background px-3"
              >
                <option value="savings">חיסכון / פיקדון</option>
                <option value="investment">השקעה</option>
                <option value="pension">פנסיה</option>
                <option value="provident">קופת גמל / השתלמות</option>
              </select>
            </label>
            <label className="block text-sm">
              מטבע
              <select
                aria-label="מטבע"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-10 border rounded-md bg-background px-3"
              >
                {["ILS", "USD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              יתרה התחלתית
              <Input
                aria-label="יתרה התחלתית"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0"
              />
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "שומר…" : "הוסף חשבון"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/**
 * Up/down buttons for reorder mode. Plain buttons, not drag-and-drop —
 * HTML5 drag-and-drop doesn't work on mobile touch, and these are
 * reliable everywhere.
 */
function ReorderControls({
  onUp,
  onDown,
  disableUp,
  disableDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUp}
        disabled={disableUp}
        aria-label="הזז למעלה"
        className="flex-1"
      >
        <ChevronUp className="size-4" />
        למעלה
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDown}
        disabled={disableDown}
        aria-label="הזז למטה"
        className="flex-1"
      >
        <ChevronDown className="size-4" />
        למטה
      </Button>
    </div>
  );
}
