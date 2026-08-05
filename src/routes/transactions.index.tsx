import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MonthPicker } from "@/components/MonthPicker";
import { fetchAllTransactions, fetchTransactionsBetween, type Transaction } from "@/lib/db";
import {
  categoryShade,
  formatILS,
  isCashflowOut,
  monthRangeFromKey,
  shiftMonth,
  txTypeLabel,
} from "@/lib/finance";
import { useSelectedMonth } from "@/lib/month-store";
import { useMemberLabels, type Person } from "@/lib/person";
import { usePaymentMethods } from "@/lib/payment_methods";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions/")({
  head: () => ({
    meta: [
      { title: "תנועות — כסף משפחתי" },
      { name: "description", content: "כל התנועות של משק הבית, חיפוש מרובה מסננים וסיכום לפי קטגוריה." },
      { property: "og:title", content: "תנועות — כסף משפחתי" },
      { property: "og:description", content: "כל התנועות של משק הבית, חיפוש מרובה מסננים וסיכום לפי קטגוריה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsList,
});

type TypeFilter = "all" | "income" | "expense" | "fixed" | "investment";
type Range = "month" | "3m" | "12m" | "all";
type Tab = "list" | "categories";

const RANGES: [Range, string][] = [
  ["month", "חודש"],
  ["3m", "3 חודשים"],
  ["12m", "12 חודשים"],
  ["all", "הכל"],
];

function TransactionsList() {
  const [month, setMonth] = useSelectedMonth();
  const [range, setRange] = useState<Range>("month");
  const [tab, setTab] = useState<Tab>("list");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [payers, setPayers] = useState<Person[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [method, setMethod] = useState<string>("");
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const memberLabels = useMemberLabels();
  const { data: paymentMethods = [] } = usePaymentMethods();

  const period = useMemo(() => {
    if (range === "all") return null;
    const back = range === "month" ? 0 : range === "3m" ? 2 : 11;
    const { start } = monthRangeFromKey(shiftMonth(month, -back));
    const { end } = monthRangeFromKey(month);
    return { start, end };
  }, [range, month]);

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
      if (needle) {
        const tagsHay = (t.transaction_tags ?? []).map((tt) => tt.tag.name).join(" ");
        const methodLabel =
          paymentMethods.find((m) => m.key === t.payment_method)?.label ?? t.payment_method ?? "";
        const hay = [
          t.title,
          t.note ?? "",
          t.category?.name ?? "",
          tagsHay,
          methodLabel,
          memberLabels[t.entered_by as Person] ?? "",
          t.entered_by,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, typeFilter, payers, cats, method, q, memberLabels, paymentMethods]);

  const summary = useMemo(() => {
    let income = 0;
    let out = 0;
    for (const t of filtered) {
      const v = Number(t.amount_ils);
      if (t.type === "income") income += v;
      else if (isCashflowOut(t.type)) out += v;
    }
    return { income, out, count: filtered.length, avg: filtered.length ? out / filtered.length : 0 };
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
    (typeFilter !== "all" ? 1 : 0) + payers.length + cats.length + (method ? 1 : 0);

  function toggle<T>(arr: T[], v: T, set: (next: T[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function clearFilters() {
    setTypeFilter("all");
    setPayers([]);
    setCats([]);
    setMethod("");
    setQ("");
  }

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">תנועות</h1>
          {range !== "all" && <MonthPicker value={month} onChange={setMonth} />}
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

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש: שם, קטגוריה, תגית, Shiri / Jonatan…"
              className="w-full rounded-xl bg-card border ps-4 pe-10 h-11 text-base outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "h-11 px-4 rounded-xl border flex items-center gap-2 text-sm shrink-0",
              showFilters || activeFilters ? "bg-primary text-primary-foreground border-primary" : "bg-card",
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
                <Chip
                  key={k}
                  active={typeFilter === k}
                  onClick={() => setTypeFilter(k)}
                >
                  {k === "all" ? "הכל" : txTypeLabel[k]}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="שולם ע״י">
              {(["yonatan", "shiri", "shared"] as Person[]).map((p) => (
                <Chip key={p} active={payers.includes(p)} onClick={() => toggle(payers, p, setPayers)}>
                  {memberLabels[p]}
                </Chip>
              ))}
            </FilterRow>

            {paymentMethods.length > 0 && (
              <FilterRow label="אמצעי תשלום">
                {paymentMethods.map((m) => (
                  <Chip
                    key={m.key}
                    active={method === m.key}
                    onClick={() => setMethod(method === m.key ? "" : m.key)}
                  >
                    {m.label}
                  </Chip>
                ))}
              </FilterRow>
            )}

            <FilterRow label="קטגוריות">
              {allCats.map((c) => (
                <Chip key={c.id} active={cats.includes(c.id)} onClick={() => toggle(cats, c.id, setCats)}>
                  {c.emoji} {c.name}
                </Chip>
              ))}
            </FilterRow>

            {(activeFilters > 0 || q) && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground inline-flex items-center gap-1"
              >
                <X className="size-3" />
                נקה מסננים
              </button>
            )}
          </div>
        )}
      </header>

      <section className="px-5 md:px-0 mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="תנועות" value={String(summary.count)} />
        <Stat label="סך יוצא" value={formatILS(summary.out)} className="text-expense" />
        <Stat label="הכנסות" value={formatILS(summary.income)} className="text-income" />
        <Stat label="ממוצע לתנועה" value={formatILS(summary.avg)} />
      </section>

      <div className="px-5 md:px-0 mt-4 flex gap-2">
        {([["list", "רשימה"], ["categories", "לפי קטגוריה"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 h-10 rounded-xl text-sm font-semibold border transition",
              tab === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5 md:px-0 mt-4 pb-6">
        {isLoading ? (
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
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border",
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-bold mt-0.5 tabular-nums", className)}>{value}</p>
    </div>
  );
}
