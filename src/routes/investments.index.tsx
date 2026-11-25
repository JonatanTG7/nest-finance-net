import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, Eye, EyeOff, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInvestmentAccount } from "@/lib/investment-accounts";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fetchInvestmentAccounts, fetchInvestmentTransactions } from "@/lib/db";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchAllTradeJournalEntries } from "@/lib/trade-journal";
import { grandTotalIlsShared } from "@/lib/net-worth";
import { IB_KIND } from "@/lib/ib";
import { useIbTotalsMap } from "@/lib/use-ib-totals";
import { useUsdIlsRate } from "@/lib/fx";
import { fetchVouchers } from "@/lib/vouchers";
import { maskAmountText, usePrivacyMode } from "@/lib/privacy";
import { useCardOrder, VOUCHERS_CARD_ID } from "@/lib/investments-order";
import { computeAccountTotals } from "@/lib/account-totals";
import {
  accountsOfPerson,
  colorAfterKindChange,
  filterAccountsByOwner,
} from "@/lib/private-accounts";
import { AccountColorPicker } from "@/components/investments/AccountColorPicker";
import { SHARED_OWNER, personAccentColor, useHouseholdPersons, type OwnerId } from "@/lib/person";
import { PersonEntryCard } from "@/components/investments/PersonEntryCard";
import { ReorderControls } from "@/components/investments/ReorderControls";
import { AddPersonDialog } from "@/components/investments/AddPersonDialog";
import { OwnerPicker } from "@/components/investments/OwnerPicker";
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
  const { hidden, toggle: togglePrivacy } = usePrivacyMode();
  const [editingOrder, setEditingOrder] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("savings");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [owner, setOwner] = useState<OwnerId>(SHARED_OWNER);
  // Hand-picked card color (null until picked — the picker shows the kind
  // default). Until the user picks one, changing the type follows the new
  // type's default color, same as the private-account dialog.
  const [color, setColor] = useState<string | null>(null);
  const [colorTouched, setColorTouched] = useState(false);
  function changeKind(next: string) {
    setKind(next);
    setColor((c) => colorAfterKindChange(c, colorTouched, next));
  }
  // Owner filter for the cards grid: "all" is the unfiltered view (shared
  // cards + person entries), "shared" shows the shared cards on their own,
  // and a person id shows that person's accounts as cards.
  const [ownerFilter, setOwnerFilter] = useState<OwnerId | "all">("all");
  const [busy, setBusy] = useState(false);
  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createInvestmentAccount({
        name,
        kind,
        balance: Number(balance || 0),
        currency,
        person: owner,
        color: color ?? undefined,
      });
      await qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      setAdding(false);
      setName("");
      setBalance("");
      setOwner(SHARED_OWNER);
      setColor(null);
      setColorTouched(false);
      toast.success("החשבון נוסף");
    } catch {
      toast.error("לא הצלחנו להוסיף את החשבון. בדוק את הפרטים ונסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["investments", "txs"],
    queryFn: fetchInvestmentTransactions,
  });
  const { data: journalEntries = [] } = useQuery({
    queryKey: ["trade-journal", "all"],
    queryFn: fetchAllTradeJournalEntries,
  });
  // Per-portfolio IB totals (cash + live positions), keyed by account id.
  // The math lives in lib/net-worth so the email digest sender shares it;
  // the hook is shared with the person pages so IB values agree everywhere.
  const ibTotals = useIbTotalsMap();
  // No hardcoded fallback rate: when the rate is unavailable the ₪ values of
  // IB portfolios are shown as "rate unavailable" instead of a wrong number.
  const { rate: fxRate } = useUsdIlsRate();

  // Non-IB balances come from the shared totals rule (baseline + post-reset
  // transactions + post-reset journal P&L); IB portfolios are valued from
  // live positions and overlaid here. The map covers every account (the
  // person cards below need their owners' totals), but the grand total
  // below sums shared accounts only — private accounts live on their
  // owners' tabs and never enter a household total.
  const totals = useMemo(() => {
    const m = computeAccountTotals({
      accounts,
      transactions: txs,
      journalEntries,
      fxRate,
    });
    for (const a of accounts) {
      if (a.kind === IB_KIND) {
        const t = ibTotals.get(a.id);
        m.set(a.id, { native: t?.native ?? 0, ils: t?.ils ?? null });
      }
    }
    return m;
  }, [txs, accounts, ibTotals, journalEntries, fxRate]);

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

  // The household members, derived from profiles + added people — one
  // entry card each, leading to that person's private tab.
  const { persons } = useHouseholdPersons();

  // Card order (accounts + vouchers card), saved per device. The grand
  // total card stays fixed at the top and is not part of the order.
  // The grid shows the accounts of the active owner filter: shared
  // accounts in the "all"/"shared" views, one person's accounts when a
  // person is picked (an account that moves to a person drops out of the
  // saved order automatically). Reordering only works in the unfiltered
  // "all" view — a filtered view is a subset, not the order itself.
  const visibleAccounts = useMemo(
    () => filterAccountsByOwner(accounts, ownerFilter),
    [accounts, ownerFilter],
  );
  const accountById = useMemo(
    () => new Map(visibleAccounts.map((a) => [a.id, a])),
    [visibleAccounts],
  );
  const showVouchersCard = ownerFilter === "all" || ownerFilter === SHARED_OWNER;
  const cardIds = useMemo(
    () => [...visibleAccounts.map((a) => a.id), ...(showVouchersCard ? [VOUCHERS_CARD_ID] : [])],
    [visibleAccounts, showVouchersCard],
  );
  const { orderedIds, move } = useCardOrder(cardIds);
  const reorderAllowed = ownerFilter === "all";

  function changeOwnerFilter(next: OwnerId | "all") {
    setOwnerFilter(next);
    // Leaving the unfiltered view exits reorder mode — the filtered grid
    // is not the saved order.
    if (next !== "all") setEditingOrder(false);
  }

  // The grand total mixes live FX (IB) with frozen historical rates (other
  // accounts) — an inherent limitation of the model. When the FX rate is
  // unavailable, IB value is excluded and flagged instead of guessed.
  // Shared accounts only — same rule as the email digest's net worth.
  const { grandIls, ibIlsMissing } = useMemo(
    () => grandTotalIlsShared(totals, accounts),
    [totals, accounts],
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
              aria-label={hidden ? "הצג סכומים" : "הסתר סכומים"}
              title={hidden ? "הצג סכומים" : "הסתר סכומים"}
            >
              {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingOrder((v) => !v)}
              aria-pressed={editingOrder}
              disabled={!reorderAllowed}
              title={reorderAllowed ? undefined : "סידור כרטיסים זמין רק בתצוגת הכול"}
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
          </div>
        </div>
      </header>

      {/* Account actions sit above the total — compact, always in reach,
          same as the person pages. Opening an account is a once-per-person
          action, so it lives here as a small button, not in the header. */}
      <section className="px-5 md:px-0">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            חשבון חדש
          </Button>
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4">
        <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
          <p className="text-sm opacity-80">סך נכסים (ש"ח)</p>
          <p className="text-4xl font-bold mt-2 tabular-nums">
            {maskAmountText(formatILS(grandIls), hidden)}
          </p>
          {ibIlsMissing && (
            <p className="text-xs opacity-70 mt-1">
              שער הדולר לא זמין כרגע — שווי תיקי ה-IB לא נכלל בסך הזה.
            </p>
          )}
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4 flex items-center gap-2 overflow-x-auto">
        {(
          [
            ["all", "הכול"],
            [SHARED_OWNER, "משותף"],
            ...persons.map((p) => [p.person, p.label] as const),
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => changeOwnerFilter(value)}
            aria-pressed={ownerFilter === value}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors",
              ownerFilter === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
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
                <p className="text-2xl font-bold mt-2 tabular-nums">
                  {maskAmountText(formatILS(voucherTotals.remaining), hidden)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {voucherTotals.count} שוברים ·{" "}
                  {maskAmountText(formatILS(voucherTotals.remaining), hidden)} יתרה
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
                className="text-2xl font-bold mt-2 tabular-nums"
                dir={a.currency !== "ILS" ? "ltr" : undefined}
              >
                {maskAmountText(formatMoney(t.native, a.currency), hidden)}
              </p>
              {a.currency !== "ILS" && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t.ils != null ? (
                    <>≈ {maskAmountText(formatILS(t.ils), hidden)}</>
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

      {ownerFilter === "all" && (
        <section className="px-5 md:px-0 mt-6 mb-8">
          <h2 className="text-sm font-semibold mb-1">חשבונות פרטיים</h2>
          <p className="text-xs text-muted-foreground mb-3">
            פנסיה, קרן השתלמות וקופות גמל — לכל אחד מבני הבית בנפרד.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {persons.map((p, i) => {
              const mine = accountsOfPerson(accounts, p.person);
              const totalIls = mine.reduce((s, a) => s + (totals.get(a.id)?.ils ?? 0), 0);
              return (
                <PersonEntryCard
                  key={p.person}
                  person={p}
                  count={mine.length}
                  totalIls={totalIls}
                  color={personAccentColor(i)}
                  hidden={hidden}
                />
              );
            })}
            <button
              type="button"
              onClick={() => setAddingPerson(true)}
              className="rounded-2xl border border-dashed bg-card/50 p-4 text-start hover:bg-accent active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-full border border-dashed flex items-center justify-center text-muted-foreground shrink-0">
                  <Plus className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">הוסף אדם</p>
                  <p className="text-xs text-muted-foreground">
                    ילד או בן בית נוסף — עם חשבונות פרטיים משלו
                  </p>
                </div>
              </div>
            </button>
          </div>
        </section>
      )}
      <AddPersonDialog open={addingPerson} onOpenChange={setAddingPerson} />
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
                onChange={(e) => changeKind(e.target.value)}
                className="w-full h-10 border rounded-md bg-background px-3"
              >
                <option value="savings">חיסכון / פיקדון</option>
                <option value="investment">השקעה</option>
                <option value="pension">פנסיה</option>
                <option value="provident">קופת גמל / השתלמות</option>
              </select>
            </label>
            <AccountColorPicker
              value={color}
              kind={kind}
              onChange={(c) => {
                setColorTouched(true);
                setColor(c);
              }}
            />
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
            <label className="block text-sm">
              בעלים
              <OwnerPicker value={owner} onChange={setOwner} />
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
