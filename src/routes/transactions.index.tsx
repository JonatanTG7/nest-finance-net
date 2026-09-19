import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { MonthPicker } from "@/components/MonthPicker";
import { fetchAllTransactions, fetchTransactionsBetween, type Transaction } from "@/lib/db";
import {
  categoryShade,
  formatILS,
  isCashflowOut,
  monthRangeFromKey,
  parseMonthKey,
  shiftMonth,
  txTypeLabel,
} from "@/lib/finance";
import { useSelectedMonth } from "@/lib/month-store";
import { isoLocal, todayISO } from "@/lib/dates";
import { useMemberLabels, type Person } from "@/lib/person";
import { usePaymentMethods } from "@/lib/payment_methods";
import {
  cardLabel,
  chargeDateFor,
  formatChargeDate,
  isCreditMethod,
  useCreditCards,
} from "@/lib/credit_cards";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { type?: TypeFilter; method?: string; card?: string; range?: Range } => {
    const allowed: TypeFilter[] = ["income", "expense", "fixed", "investment"];
    const ranges: Range[] = ["month", "3m", "12m", "year", "all", "custom"];
    const t = search.type as TypeFilter | undefined;
    const r = search.range as Range | undefined;
    return {
      type: t && allowed.includes(t) ? t : undefined,
      method: typeof search.method === "string" ? search.method : undefined,
      card: typeof search.card === "string" ? search.card : undefined,
      range: r && ranges.includes(r) ? r : undefined,
    };
  },

  head: () => ({
    meta: [
      { title: "תנועות — כסף משפחתי" },
      {
        name: "description",
        content: "כל התנועות של משק הבית, חיפוש מרובה מסננים וסיכום לפי קטגוריה.",
      },
      { property: "og:title", content: "תנועות — כסף משפחתי" },
      {
        property: "og:description",
        content: "כל התנועות של משק הבית, חיפוש מרובה מסננים וסיכום לפי קטגוריה.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsList,
});

type TypeFilter = "all" | "income" | "expense" | "fixed" | "investment";
type Range = "month" | "3m" | "12m" | "year" | "all" | "custom";
type Tab = "list" | "categories" | "insights";

const RANGES: [Range, string][] = [
  ["month", "חודש"],
  ["year", "השנה"],
  ["custom", "טווח תאריכים"],
];

function TransactionsList() {
  const search = Route.useSearch();
  const [month, setMonth] = useSelectedMonth();
  const [range, setRange] = useState<Range>(search.range ?? "month");
  const [yearEnd, setYearEnd] = useState<string>(todayISO());
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [tab, setTab] = useState<Tab>("list");

  // Applied filters — these actually filter the list below.
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(search.type ?? "all");
  const [payers, setPayers] = useState<Person[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [method, setMethod] = useState<string>(search.method ?? "");
  const [card, setCard] = useState<string>(search.card ?? "");

  // Draft filters — edited inside the open filter panel, only take effect
  // once "החל סינון" is pressed, so the list doesn't jump around mid-edit.
  const [draftTypeFilter, setDraftTypeFilter] = useState<TypeFilter>(typeFilter);
  const [draftPayers, setDraftPayers] = useState<Person[]>(payers);
  const [draftCats, setDraftCats] = useState<string[]>(cats);
  const [draftMethod, setDraftMethod] = useState<string>(method);
  const [draftCard, setDraftCard] = useState<string>(card);

  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Deep-linked from the home screen (e.g. tapping "הכנסות" or a credit card) — apply immediately.
  useEffect(() => {
    if (search.type) {
      setTypeFilter(search.type);
      setDraftTypeFilter(search.type);
    }
    if (search.method) {
      setMethod(search.method);
      setDraftMethod(search.method);
    }
    if (search.card) {
      setCard(search.card);
      setDraftCard(search.card);
    }
    if (search.range) setRange(search.range);
  }, [search.type, search.method, search.card, search.range]);

  function openFilters() {
    // Re-sync draft with whatever is currently applied before editing.
    setDraftTypeFilter(typeFilter);
    setDraftPayers(payers);
    setDraftCats(cats);
    setDraftMethod(method);
    setDraftCard(card);
    setShowFilters(true);
  }

  function applyFilters() {
    setTypeFilter(draftTypeFilter);
    setPayers(draftPayers);
    setCats(draftCats);
    setMethod(draftMethod);
    setCard(isCreditMethod(draftMethod) ? draftCard : "");
    setShowFilters(false);
  }

  const memberLabels = useMemberLabels();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: creditCards = [] } = useCreditCards();


  const period = useMemo(() => {
    if (range === "all") return null;
    if (range === "custom") {
      if (!customStart || !customEnd) return null;
      // "end" is exclusive downstream — push it one day forward so the
      // selected end date itself is included.
      const [y, m, d] = customEnd.split("-").map(Number);
      const endExclusive = isoLocal(new Date(y, m - 1, d + 1));
      return customStart <= customEnd ? { start: customStart, end: endExclusive } : null;
    }
    if (range === "year") {
      const y = new Date().getFullYear();
      const end = yearEnd || todayISO();
      const [ey, em, ed] = end.split("-").map(Number);
      const endExclusive = isoLocal(new Date(ey, em - 1, ed + 1));
      return { start: `${y}-01-01`, end: endExclusive };
    }
    const back = range === "month" ? 0 : range === "3m" ? 2 : 11;
    const { start } = monthRangeFromKey(shiftMonth(month, -back));
    const { end } = monthRangeFromKey(month);
    return { start, end };
  }, [range, month, yearEnd, customStart, customEnd]);

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["transactions", "range", range, period?.start ?? "all", period?.end ?? "all"],
    queryFn: () =>
      period ? fetchTransactionsBetween(period.start, period.end) : fetchAllTransactions(1000),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (payers.length && !payers.includes(t.entered_by as Person)) return false;
      if (cats.length && !cats.includes(t.category?.id ?? "none")) return false;
      if (method && t.payment_method !== method) return false;
      if (card && t.credit_card_id !== card) return false;
      if (needle) {
        const tagsHay = (t.transaction_tags ?? []).map((tt) => tt.tag.name).join(" ");
        const methodLabel =
          paymentMethods.find((m) => m.key === t.payment_method)?.label ?? t.payment_method ?? "";
        const cardName = creditCards.find((c) => c.id === t.credit_card_id);
        const hay = [
          t.title,
          t.note ?? "",
          t.category?.name ?? "",
          tagsHay,
          methodLabel,
          cardName ? cardLabel(cardName) : "",
          memberLabels[t.entered_by as Person] ?? "",
          t.entered_by,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, typeFilter, payers, cats, method, card, q, memberLabels, paymentMethods, creditCards]);

  // When a specific card is selected, break the total down by the date the
  // bank actually charges it, instead of showing one lump sum.
  const selectedCard = creditCards.find((c) => c.id === card) ?? null;
  const byChargeDate = useMemo(() => {
    if (!selectedCard) return [];
    const m = new Map<string, { total: number; count: number }>();
    for (const t of filtered) {
      const d = chargeDateFor(t.occurred_at, selectedCard.billing_day);
      const prev = m.get(d) ?? { total: 0, count: 0 };
      prev.total += Number(t.amount_ils);
      prev.count += 1;
      m.set(d, prev);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, v]) => ({ date, ...v }));
  }, [filtered, selectedCard]);


  const summary = useMemo(() => {
    let income = 0;
    let out = 0;
    for (const t of filtered) {
      const v = Number(t.amount_ils);
      if (t.type === "income") income += v;
      else if (isCashflowOut(t.type)) out += v;
    }
    return {
      income,
      out,
      count: filtered.length,
      avg: filtered.length ? out / filtered.length : 0,
    };
  }, [filtered]);

  const byCategory = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; emoji: string; color: string; count: number; total: number }
    >();
    let i = 0;
    for (const t of filtered) {
      const id = t.category?.id ?? "none";
      const prev = m.get(id);
      if (prev) {
        prev.count += 1;
        prev.total += Number(t.amount_ils);
      } else {
        const base = t.category?.color ?? "#888";
        m.set(id, {
          id,
          name: t.category?.name ?? "ללא קטגוריה",
          emoji: t.category?.emoji ?? "•",
          color: t.category ? categoryShade(base, t.category.id, i++) : "#888",
          count: 1,
          total: Number(t.amount_ils),
        });
      }
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Insights tab — always compares real calendar months around the current
  // MonthPicker selection, independent of whatever range/filters are active
  // in the list/categories tabs. Fetched lazily, only when the tab is open.
  const { data: trendTxs = [] } = useQuery({
    queryKey: ["transactions", "insights-trend", month],
    queryFn: () => {
      const sixAgo = shiftMonth(month, -5);
      const { start } = monthRangeFromKey(sixAgo);
      const { end } = monthRangeFromKey(month);
      return fetchTransactionsBetween(start, end);
    },
    enabled: tab === "insights",
  });

  const monthlyOut = useMemo(() => {
    const buckets = new Map<
      string,
      { key: string; label: string; income: number; expense: number; fixed: number; investment: number; out: number }
    >();
    for (let i = 5; i >= 0; i--) {
      const k = shiftMonth(month, -i);
      buckets.set(k, {
        key: k,
        label: new Intl.DateTimeFormat("he-IL", { month: "short" }).format(parseMonthKey(k)),
        income: 0,
        expense: 0,
        fixed: 0,
        investment: 0,
        out: 0,
      });
    }
    for (const t of trendTxs) {
      const k = t.occurred_at.slice(0, 7);
      const b = buckets.get(k);
      if (!b) continue;
      const v = Number(t.amount_ils);
      if (t.type === "income") b.income += v;
      else if (t.type === "expense") b.expense += v;
      else if (t.type === "fixed") b.fixed += v;
      else if (t.type === "investment" || t.type === "savings") b.investment += v;
      if (isCashflowOut(t.type)) b.out += v;
    }
    return Array.from(buckets.values());
  }, [trendTxs, month]);

  const thisVsLast = useMemo(() => {
    const thisM = monthlyOut[monthlyOut.length - 1];
    const lastM = monthlyOut[monthlyOut.length - 2];
    if (!thisM || !lastM) return null;
    const delta = thisM.out - lastM.out;
    const pct = lastM.out > 0 ? (delta / lastM.out) * 100 : null;
    return { thisOut: thisM.out, lastOut: lastM.out, delta, pct };
  }, [monthlyOut]);

  const categoryMovers = useMemo(() => {
    if (monthlyOut.length < 2) return [];
    const thisKey = monthlyOut[monthlyOut.length - 1].key;
    const lastKey = monthlyOut[monthlyOut.length - 2].key;
    const thisM = new Map<string, { name: string; emoji: string; total: number }>();
    const lastM = new Map<string, number>();
    for (const t of trendTxs) {
      if (!isCashflowOut(t.type)) continue;
      const k = t.occurred_at.slice(0, 7);
      if (k !== thisKey && k !== lastKey) continue;
      const id = t.category?.id ?? "none";
      const v = Number(t.amount_ils);
      if (k === thisKey) {
        const prev = thisM.get(id);
        if (prev) prev.total += v;
        else thisM.set(id, { name: t.category?.name ?? "ללא קטגוריה", emoji: t.category?.emoji ?? "•", total: v });
      } else {
        lastM.set(id, (lastM.get(id) ?? 0) + v);
      }
    }
    const ids = new Set([...thisM.keys(), ...lastM.keys()]);
    return Array.from(ids)
      .map((id) => {
        const cur = thisM.get(id);
        const thisTotal = cur?.total ?? 0;
        const lastTotal = lastM.get(id) ?? 0;
        return {
          id,
          name: cur?.name ?? "ללא קטגוריה",
          emoji: cur?.emoji ?? "•",
          thisTotal,
          lastTotal,
          delta: thisTotal - lastTotal,
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }, [trendTxs, monthlyOut]);

  const allCats = useMemo(() => {
    const m = new Map<string, { id: string; name: string; emoji: string }>();
    for (const t of txs) {
      const id = t.category?.id ?? "none";
      if (!m.has(id))
        m.set(id, { id, name: t.category?.name ?? "ללא קטגוריה", emoji: t.category?.emoji ?? "•" });
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [txs]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const arr = map.get(t.occurred_at) ?? [];
      arr.push(t);
      map.set(t.occurred_at, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const activeFilters =
    (typeFilter !== "all" ? 1 : 0) +
    payers.length +
    cats.length +
    (method ? 1 : 0) +
    (card ? 1 : 0);

  function toggle<T>(arr: T[], v: T, set: (next: T[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function clearFilters() {
    setTypeFilter("all");
    setPayers([]);
    setCats([]);
    setMethod("");
    setCard("");
    setDraftTypeFilter("all");
    setDraftPayers([]);
    setDraftCats([]);
    setDraftMethod("");
    setDraftCard("");
    setQ("");
  }


  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">תנועות</h1>
          {range === "month" && <MonthPicker value={month} onChange={setMonth} />}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0 pb-1">
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={cn(
                "px-4 h-9 rounded-full text-sm whitespace-nowrap border transition",
                range === k
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {range === "year" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              1.1.{new Date().getFullYear()} עד
            </span>
            <input
              type="date"
              value={yearEnd}
              onChange={(e) => setYearEnd(e.target.value)}
              dir="ltr"
              className="flex-1 h-10 rounded-xl bg-card border px-3 text-sm outline-none"
            />
          </div>
        )}

        {range === "custom" && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              dir="ltr"
              className="flex-1 h-10 rounded-xl bg-card border px-3 text-sm outline-none"
            />
            <span className="text-xs text-muted-foreground">עד</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              dir="ltr"
              className={cn(
                "flex-1 h-10 rounded-xl bg-card border px-3 text-sm outline-none",
                customStart && customEnd && customEnd < customStart && "border-destructive",
              )}
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש: שם, קטגוריה, תגית.."
              className="w-full rounded-xl bg-card border ps-4 pe-10 h-11 text-base outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => (showFilters ? setShowFilters(false) : openFilters())}
            className={cn(
              "h-11 px-4 rounded-xl border flex items-center gap-2 text-sm shrink-0",
              showFilters || activeFilters
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card",
            )}
          >
            <SlidersHorizontal className="size-4" />
            {activeFilters ? activeFilters : "סינון"}
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 rounded-2xl border bg-card p-3 space-y-3">
            <FilterRow label="סוג">
              {(["all", "income", "expense", "fixed", "investment"] as TypeFilter[]).map((k) => (
                <Chip key={k} active={draftTypeFilter === k} onClick={() => setDraftTypeFilter(k)}>
                  {k === "all" ? "הכל" : txTypeLabel[k]}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="שולם ע״י">
              {(["yonatan", "shiri", "shared"] as Person[]).map((p) => (
                <Chip
                  key={p}
                  active={draftPayers.includes(p)}
                  onClick={() => toggle(draftPayers, p, setDraftPayers)}
                >
                  {memberLabels[p]}
                </Chip>
              ))}
            </FilterRow>

            {paymentMethods.length > 0 && (
              <FilterRow label="אמצעי תשלום">
                {paymentMethods.map((m) => (
                  <Chip
                    key={m.key}
                    active={draftMethod === m.key}
                    onClick={() => setDraftMethod(draftMethod === m.key ? "" : m.key)}
                  >
                    {m.label}
                  </Chip>
                ))}
              </FilterRow>
            )}

            {isCreditMethod(draftMethod) && creditCards.length > 0 && (
              <FilterRow label="כרטיס">
                <Chip active={!draftCard} onClick={() => setDraftCard("")}>
                  כל הכרטיסים
                </Chip>
                {creditCards.map((c) => (
                  <Chip
                    key={c.id}
                    active={draftCard === c.id}
                    onClick={() => setDraftCard(draftCard === c.id ? "" : c.id)}
                  >
                    {cardLabel(c)}
                  </Chip>
                ))}
              </FilterRow>
            )}


            <FilterRow label="קטגוריות">
              {allCats.map((c) => (
                <Chip
                  key={c.id}
                  active={draftCats.includes(c.id)}
                  onClick={() => toggle(draftCats, c.id, setDraftCats)}
                >
                  {c.emoji} {c.name}
                </Chip>
              ))}
            </FilterRow>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={applyFilters}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
              >
                החל סינון
              </button>
              <button
                onClick={clearFilters}
                className="h-11 px-4 rounded-xl border text-sm text-muted-foreground inline-flex items-center gap-1"
              >
                <X className="size-3" />
                נקה
              </button>
            </div>
          </div>
        )}
      </header>

      <section className="px-5 md:px-0 mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="תנועות" value={String(summary.count)} />
        <Stat label="סך יוצא" value={formatILS(summary.out)} className="text-expense" />
        <Stat label="הכנסות" value={formatILS(summary.income)} className="text-income" />
        <Stat label="ממוצע לתנועה" value={formatILS(summary.avg)} />
      </section>

      {selectedCard && byChargeDate.length > 0 && (
        <section className="px-5 md:px-0 mt-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{cardLabel(selectedCard)} — לפי מועד חיוב</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatILS(byChargeDate.reduce((s, d) => s + d.total, 0))}
              </span>
            </div>
            <ul className="divide-y -my-1">
              {byChargeDate.map((d) => (
                <li key={d.date} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    חיוב ב-{formatChargeDate(d.date)}
                    <span className="text-xs text-muted-foreground"> · {d.count} תנועות</span>
                  </span>
                  <span className="font-bold tabular-nums">{formatILS(d.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}


      <div className="px-5 md:px-0 mt-4 flex gap-2">
        {(
          [
            ["list", "רשימה"],
            ["categories", "לפי קטגוריה"],
            ["insights", "תובנות"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 h-10 rounded-xl text-sm font-semibold border transition",
              tab === k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5 md:px-0 mt-4 pb-6">
        {tab === "insights" ? (
          <InsightsPanel monthlyOut={monthlyOut} thisVsLast={thisVsLast} categoryMovers={categoryMovers} />
        ) : isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">לא נמצאו תנועות</p>
        ) : tab === "categories" ? (
          <ul className="rounded-2xl bg-card border divide-y">
            {byCategory.map((c) => {
              const pct = summary.out > 0 ? Math.round((c.total / summary.out) * 100) : 0;
              const active = cats.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => toggle(cats, c.id, setCats)}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 text-start hover:bg-accent/50",
                      active && "bg-accent/40",
                    )}
                  >
                    <span
                      className="size-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: c.color + "22" }}
                    >
                      {c.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.count} תנועות · {pct}% מסך היוצא
                      </p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-accent overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: c.color }}
                        />
                      </div>
                    </div>
                    <p className="font-bold tabular-nums shrink-0">{formatILS(c.total)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-5">
            {grouped.map(([date, items]) => (
              <li key={date}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("he-IL", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: range === "month" ? undefined : "numeric",
                    }).format(new Date(date))}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatILS(
                      items.reduce(
                        (s, t) => s + (isCashflowOut(t.type) ? Number(t.amount_ils) : 0),
                        0,
                      ),
                    )}
                  </p>
                </div>
                <div className="rounded-2xl bg-card border divide-y">
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      to="/transactions/$id"
                      params={{ id: t.id }}
                      className="flex items-center gap-3 p-4 hover:bg-accent/50 active:bg-accent/50"
                    >
                      <div
                        className="size-10 rounded-full flex items-center justify-center text-lg shrink-0"
                        style={{ background: (t.category?.color ?? "#888") + "22" }}
                      >
                        {t.category?.emoji ?? t.title.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.category?.name ?? txTypeLabel[t.type]} ·{" "}
                          {memberLabels[t.entered_by as Person]}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "font-bold tabular-nums shrink-0",
                          t.type === "income" ? "text-income" : "text-foreground",
                        )}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {formatILS(Number(t.amount_ils))}
                      </p>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 h-8 rounded-full text-xs border transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-card border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-bold mt-0.5 tabular-nums", className)}>{value}</p>
    </div>
  );
}

function InsightsPanel({
  monthlyOut,
  thisVsLast,
  categoryMovers,
}: {
  monthlyOut: {
    key: string;
    label: string;
    income: number;
    expense: number;
    fixed: number;
    investment: number;
    out: number;
  }[];
  thisVsLast: { thisOut: number; lastOut: number; delta: number; pct: number | null } | null;
  categoryMovers: { id: string; name: string; emoji: string; thisTotal: number; lastTotal: number; delta: number }[];
}) {
  const noData = monthlyOut.every((m) => m.out === 0 && m.income === 0);

  return (
    <div className="space-y-5">
      {/* This month vs last month */}
      {thisVsLast && (thisVsLast.thisOut > 0 || thisVsLast.lastOut > 0) && (
        <div className="rounded-2xl bg-card border p-4">
          <p className="text-xs text-muted-foreground mb-2">החודש לעומת החודש הקודם</p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatILS(thisVsLast.thisOut)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                לעומת {formatILS(thisVsLast.lastOut)} בחודש הקודם
              </p>
            </div>
            {thisVsLast.pct != null && (
              <div
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-sm font-semibold shrink-0",
                  thisVsLast.delta > 0
                    ? "bg-rose-500/10 text-rose-500"
                    : thisVsLast.delta < 0
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {thisVsLast.delta > 0 ? (
                  <TrendingUp className="size-4" />
                ) : thisVsLast.delta < 0 ? (
                  <TrendingDown className="size-4" />
                ) : (
                  <Minus className="size-4" />
                )}
                {Math.abs(thisVsLast.pct).toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6-month trend */}
      <div className="rounded-2xl bg-card border p-4">
        <p className="text-sm font-semibold mb-3">6 חודשים אחרונים</p>
        {noData ? (
          <p className="text-center text-sm text-muted-foreground py-10">אין נתונים בטווח הזה</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyOut} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => formatILS(v)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="הכנסות" fill="var(--income)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="הוצאות" fill="var(--expense)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="fixed" name="קבועות" fill="var(--fixed)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="investment" name="השקעה" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Biggest category movers vs last month */}
      {categoryMovers.length > 0 && (
        <div className="rounded-2xl bg-card border p-4">
          <p className="text-sm font-semibold mb-3">השינויים הבולטים בקטגוריות</p>
          <ul className="divide-y -mx-4">
            {categoryMovers.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-lg shrink-0">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatILS(c.thisTotal)} · חודש קודם {formatILS(c.lastTotal)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums",
                    c.delta > 0 ? "text-rose-500" : c.delta < 0 ? "text-emerald-500" : "text-muted-foreground",
                  )}
                >
                  {c.delta > 0 ? <TrendingUp className="size-3.5" /> : c.delta < 0 ? <TrendingDown className="size-3.5" /> : null}
                  {c.delta > 0 ? "+" : ""}
                  {formatILS(c.delta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
