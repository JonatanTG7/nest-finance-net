import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { MonthPicker } from "@/components/MonthPicker";
import { UpcomingCharges } from "@/components/UpcomingCharges";
import { Plane, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { fetchTrips, tripStatus } from "@/lib/trips";
import { fetchAllTransactions, fetchTransactionsBetween, type Transaction } from "@/lib/db";
import {
  cycleRangeFromKey,
  todayLocalISO,
  formatILS,
  isCashflowOut,
  monthRangeFromKey,
  parseMonthKey,
  shiftMonth,
  txTypeLabel,
} from "@/lib/finance";
import { useSelectedMonth } from "@/lib/month-store";
import { useMemberLabels } from "@/lib/person";
import { useMyProfile } from "@/lib/household";
import { usePeriodSettings } from "@/lib/personal_settings";
import { cn } from "@/lib/utils";

/**
 * A deliberately spaced-out palette for category breakdowns. Deriving
 * colors from each category's own base hue (categoryShade) often puts two
 * unrelated categories in near-identical shades of the same color (e.g.
 * two different greens), which is unreadable in a pie/donut legend. This
 * palette guarantees every slice is visually distinct regardless of what
 * color the category itself was given.
 */
const CATEGORY_PALETTE = [
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f97316", // orange
  "#a855f7", // purple
  "#eab308", // yellow
  "#ef4444", // red
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
];

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "ControlFlow-Finance" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [month, setMonth] = useSelectedMonth();
  const { mode, startDay } = usePeriodSettings();
  const { start, end, startDate } = useMemo(
    () => (mode === "cycle" ? cycleRangeFromKey(month, startDay) : monthRangeFromKey(month)),
    [month, mode, startDay],
  );
  const today = todayLocalISO();
  const { data: profile } = useMyProfile();
  const firstName = (profile?.display_name ?? "").split(" ")[0];
  const { data: trips = [] } = useQuery({ queryKey: ["trips"], queryFn: fetchTrips });
  const activeTrip = trips.find((t) => tripStatus(t) === "active");

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["dashboard", "month", start, end],
    queryFn: () => fetchTransactionsBetween(start, end),
  });

  // The period immediately before the current one (same length/anchor rule —
  // cycle or calendar month, whichever this household uses) — for the
  // "higher / lower than last time" comparisons.
  const prevRange = useMemo(() => {
    const prevKey = shiftMonth(month, -1);
    return mode === "cycle" ? cycleRangeFromKey(prevKey, startDay) : monthRangeFromKey(prevKey);
  }, [month, mode, startDay]);

  const { data: prevTxs = [] } = useQuery({
    queryKey: ["dashboard", "prev", prevRange.start, prevRange.end],
    queryFn: () => fetchTransactionsBetween(prevRange.start, prevRange.end),
  });


  // 6-month rolling window for the trend chart
  const { data: trendTxs = [] } = useQuery({
    queryKey: ["dashboard", "trend", month],
    queryFn: () => {
      const sixAgo = shiftMonth(month, -5);
      const { start: s } = monthRangeFromKey(sixAgo);
      const { end: e } = monthRangeFromKey(month);
      return fetchTransactionsBetween(s, e);
    },
  });

  const sumTotals = (list: Transaction[]) => {
    let income = 0,
      expense = 0,
      fixed = 0,
      investment = 0;
    for (const t of list) {
      const v = Number(t.amount_ils);
      switch (t.type) {
        case "income":
          income += v;
          break;
        case "expense":
          expense += v;
          break;
        case "fixed":
          fixed += v;
          break;
        // legacy "savings" transactions are treated as investments
        case "savings":
          investment += v;
          break;
        case "investment":
          investment += v;
          break;
      }
    }
    const remaining = income - expense - fixed - investment;
    return { income, expense, fixed, investment, remaining };
  };

  /** Full period (everything recorded in the period) — used for the forecast. */
  const totals = useMemo(() => sumTotals(txs), [txs]);

  /** Only what has already happened — money actually in and out until today. */
  const soFar = useMemo(
    () => sumTotals(txs.filter((t) => t.occurred_at <= today)),
    [txs, today],
  );

  /** Is "today" inside the displayed period at all? */
  const periodIsCurrent = today >= start && today < end;


  // Pie: outflow per category, each slice in its own colour
  const pieData = useMemo(() => {
    const m = new Map<string, { key: string; name: string; value: number }>();
    for (const t of txs) {
      if (!isCashflowOut(t.type)) continue;
      const key = t.category?.id ?? "other";
      const name = t.category?.name ?? "ללא קטגוריה";
      const prev = m.get(key);
      if (prev) prev.value += Number(t.amount_ils);
      else m.set(key, { key, name, value: Number(t.amount_ils) });
    }
    return Array.from(m.values())
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }));
  }, [txs]);

  // Top 5 categories (bar with category colors)
  const topCats = useMemo(() => pieData.slice(0, 5), [pieData]);

  const prevTotals = useMemo(() => sumTotals(prevTxs), [prevTxs]);

  /** This period vs the one before it — total in / total out. */
  const comparison = useMemo(() => {
    const out = totals.expense + totals.fixed + totals.investment;
    const prevOut = prevTotals.expense + prevTotals.fixed + prevTotals.investment;
    const outDelta = out - prevOut;
    const outPct = prevOut > 0 ? (outDelta / prevOut) * 100 : null;
    const incomeDelta = totals.income - prevTotals.income;
    const incomePct = prevTotals.income > 0 ? (incomeDelta / prevTotals.income) * 100 : null;
    return { out, prevOut, outDelta, outPct, incomeDelta, incomePct };
  }, [totals, prevTotals]);

  /** Per-category outflow for the previous period, keyed by category id. */
  const prevByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of prevTxs) {
      if (!isCashflowOut(t.type)) continue;
      const key = t.category?.id ?? "other";
      m.set(key, (m.get(key) ?? 0) + Number(t.amount_ils));
    }
    return m;
  }, [prevTxs]);

  /** Categories with the biggest ILS change vs the previous period. */
  const categoryMovers = useMemo(() => {
    const ids = new Set([...pieData.map((d) => d.key), ...prevByCategory.keys()]);
    return Array.from(ids)
      .map((id) => {
        const cur = pieData.find((d) => d.key === id);
        const thisTotal = cur?.value ?? 0;
        const lastTotal = prevByCategory.get(id) ?? 0;
        return {
          id,
          name: cur?.name ?? "ללא קטגוריה",
          color: cur?.color ?? "#888",
          thisTotal,
          lastTotal,
          delta: thisTotal - lastTotal,
        };
      })
      .filter((c) => c.thisTotal > 0 || c.lastTotal > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }, [pieData, prevByCategory]);

  // A few concrete, at-a-glance facts for inspiration/awareness.
  const quickInsights = useMemo(() => {
    const outTotal = pieData.reduce((s, d) => s + d.value, 0);
    const topCategory =
      pieData.length > 0 && outTotal > 0
        ? { ...pieData[0], pct: Math.round((pieData[0].value / outTotal) * 100) }
        : null;

    const spendTxs = txs.filter((t) => isCashflowOut(t.type));
    const largest =
      spendTxs.length > 0
        ? spendTxs.reduce((max, t) => (Number(t.amount_ils) > Number(max.amount_ils) ? t : max), spendTxs[0])
        : null;

    const daysElapsed = Math.max(
      1,
      Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) -
        Math.max(0, Math.round((new Date(end).getTime() - new Date(todayLocalISO()).getTime()) / 86_400_000)),
    );
    const avgDaily = outTotal / daysElapsed;

    return { topCategory, largest, avgDaily };
  }, [pieData, txs, start, end]);

  // Trend: 6 months, totals per type
  const trendData = useMemo(() => {
    const buckets = new Map<
      string,
      { month: string; income: number; expense: number; fixed: number; investment: number }
    >();
    for (let i = 5; i >= 0; i--) {
      const k = shiftMonth(month, -i);
      buckets.set(k, {
        month: new Intl.DateTimeFormat("he-IL", { month: "short" }).format(parseMonthKey(k)),
        income: 0,
        expense: 0,
        fixed: 0,
        investment: 0,
      });
    }
    for (const t of trendTxs) {
      const k = t.occurred_at.slice(0, 7);
      const b = buckets.get(k);
      if (!b) continue;
      // Fold legacy "savings" transactions into investment.
      const bucketKey = t.type === "savings" ? "investment" : t.type;
      if (
        bucketKey === "income" ||
        bucketKey === "expense" ||
        bucketKey === "fixed" ||
        bucketKey === "investment"
      ) {
        b[bucketKey] += Number(t.amount_ils);
      }
    }
    return Array.from(buckets.values());
  }, [trendTxs, month]);

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">שלום{firstName ? ` ${firstName}` : ""} 👋</p>
          <h1 className="text-2xl font-bold mt-1">סיכום חודשי</h1>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      {activeTrip && (
        <section className="px-5 md:px-0 mb-3">
          <Link
            to="/travel/$tripId"
            params={{ tripId: activeTrip.id }}
            className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-sky-500/15 to-transparent border border-sky-500/30 p-4"
          >
            <span className="size-10 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
              <Plane className="size-5 text-sky-500" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">אתם בטיול: {activeTrip.name} 🧳</p>
              <p className="text-xs text-muted-foreground">
                הקישו כדי לראות את הטיול ולהוסיף הוצאה
              </p>
            </div>
          </Link>
        </section>
      )}

      <section className="px-5 md:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6 shadow-lg shadow-primary/20">
          <p className="text-sm opacity-90">פנוי לחודש (אחרי הוצאות, קבועות והשקעה)</p>
          <p className="text-4xl font-bold mt-2 tabular-nums">{formatILS(totals.remaining)}</p>
          <div className="mt-4 flex gap-4 text-sm flex-wrap">
            <div>
              <p className="opacity-80">הכנסות</p>
              <p className="font-semibold tabular-nums">{formatILS(totals.income)}</p>
            </div>
            <div>
              <p className="opacity-80">סך יוצא</p>
              <p className="font-semibold tabular-nums">
                {formatILS(totals.expense + totals.fixed + totals.investment)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          to="/transactions"
          search={{ type: "income" }}
          className="block active:scale-[0.98] transition-transform"
        >
          <StatCard label="הכנסות" value={totals.income} className="bg-income/15 text-income" />
        </Link>
        <Link
          to="/transactions"
          search={{ type: "expense" }}
          className="block active:scale-[0.98] transition-transform"
        >
          <StatCard label="הוצאות" value={totals.expense} className="bg-expense/15 text-expense" />
        </Link>
        <Link
          to="/transactions"
          search={{ type: "fixed" }}
          className="block active:scale-[0.98] transition-transform"
        >
          <StatCard label="קבועות" value={totals.fixed} className="bg-fixed/15 text-fixed" />
        </Link>
        <Link to="/investments" className="block active:scale-[0.98] transition-transform">
          <StatCard
            label="השקעה"
            value={totals.investment}
            className="bg-savings/25 text-foreground"
          />
        </Link>
      </section>

      <UpcomingCharges />

      {/* This period vs the one before it */}
      <section className="px-5 md:px-0 mt-4 grid grid-cols-2 gap-3">
        <ComparisonCard
          label="סך יוצא"
          delta={comparison.outDelta}
          pct={comparison.outPct}
          goodDirection="down"
        />
        <ComparisonCard
          label="הכנסות"
          delta={comparison.incomeDelta}
          pct={comparison.incomePct}
          goodDirection="up"
        />
      </section>

      {categoryMovers.length > 0 && (
        <section className="px-5 md:px-0 mt-4">
          <Card title="השינויים הבולטים לעומת התקופה הקודמת">
            <ul className="divide-y -mx-4">
              {categoryMovers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatILS(c.thisTotal)} · קודם {formatILS(c.lastTotal)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums",
                      c.delta > 0
                        ? "text-rose-500"
                        : c.delta < 0
                          ? "text-emerald-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {c.delta > 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : c.delta < 0 ? (
                      <TrendingDown className="size-3.5" />
                    ) : null}
                    {c.delta > 0 ? "+" : ""}
                    {formatILS(c.delta)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-6 px-5 md:px-0">

        <Card title="הוצאות לפי קטגוריה">
          {pieData.length === 0 ? (
            <Empty>אין עדיין הוצאות בחודש זה</Empty>
          ) : (
            <>
              <div className="h-56 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={90}
                      paddingAngle={3}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: string) => [formatILS(v), n]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Total in the donut's center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[11px] text-muted-foreground">סה״כ</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatILS(pieData.reduce((s, d) => s + d.value, 0))}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {(() => {
                  const total = pieData.reduce((s, d) => s + d.value, 0);
                  return pieData.slice(0, 8).map((d) => (
                    <li key={d.key} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="truncate flex-1">{d.name}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                      </span>
                      <span className="tabular-nums font-medium shrink-0 w-16 text-left">
                        {formatILS(d.value)}
                      </span>
                    </li>
                  ));
                })()}
              </ul>
            </>
          )}
        </Card>

        <Card title="טופ 5 קטגוריות">
          {topCats.length === 0 ? (
            <Empty>אין נתונים</Empty>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCats} margin={{ top: 20, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    tickFormatter={(v: string) => (v.length > 6 ? v.slice(0, 6) + "…" : v)}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    formatter={(v: number) => formatILS(v)}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {topCats.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {(quickInsights.topCategory || quickInsights.largest) && (
        <section className="px-5 md:px-0 mt-4">
          <Card title="תובנות מהירות">
            <ul className="space-y-3 text-sm">
              {quickInsights.topCategory && (
                <li className="flex items-center gap-3">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ background: quickInsights.topCategory.color }}
                  />
                  <span>
                    הקטגוריה המובילה היא <b>{quickInsights.topCategory.name}</b> —{" "}
                    {formatILS(quickInsights.topCategory.value)} ({quickInsights.topCategory.pct}% מההוצאות)
                  </span>
                </li>
              )}
              {quickInsights.largest && (
                <li className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full shrink-0 bg-rose-500" />
                  <span>
                    ההוצאה הבודדת הגדולה ביותר: <b>{quickInsights.largest.title}</b> —{" "}
                    {formatILS(Number(quickInsights.largest.amount_ils))}
                  </span>
                </li>
              )}
              <li className="flex items-center gap-3">
                <span className="size-2.5 rounded-full shrink-0 bg-sky-500" />
                <span>
                  קצב ההוצאה הממוצע: <b>{formatILS(quickInsights.avgDaily)}</b> ליום
                </span>
              </li>
            </ul>
          </Card>
        </section>
      )}

      <section className="px-5 md:px-0 mt-4">
        <Card title="6 חודשים אחרונים">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} reversed />
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
        </Card>
      </section>

      <section className="px-5 md:px-0 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">פעולות אחרונות</h2>
          <Link to="/transactions" className="text-xs text-primary">
            הצג הכל
          </Link>
        </div>
        <div className="rounded-2xl bg-card border divide-y">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">טוען…</div>
          ) : txs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              אין עדיין תנועות בחודש זה.
            </div>
          ) : (
            txs.slice(0, 8).map((t) => <TxRow key={t.id} tx={t} />)
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{children}</p>;
}

function ComparisonCard({
  label,
  delta,
  pct,
  goodDirection,
}: {
  label: string;
  delta: number;
  pct: number | null;
  /** Whether a rise ("up") or a drop ("down") in this metric is the good outcome. */
  goodDirection: "up" | "down";
}) {
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const isGood = direction === "flat" ? null : direction === goodDirection;
  return (
    <div className="rounded-2xl bg-card border p-4">
      <p className="text-xs text-muted-foreground">{label} לעומת קודם</p>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <p className="text-lg font-bold tabular-nums" dir="ltr">
          {delta > 0 ? "+" : ""}
          {formatILS(delta)}
        </p>
        {pct != null && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-semibold shrink-0",
              isGood == null ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {direction === "up" ? (
              <TrendingUp className="size-3.5" />
            ) : direction === "down" ? (
              <TrendingDown className="size-3.5" />
            ) : (
              <Minus className="size-3.5" />
            )}
            {Math.abs(pct).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl p-4", className)}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold mt-1 tabular-nums">{formatILS(value)}</p>
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const isIn = tx.type === "income";
  const memberLabels = useMemberLabels();
  return (
    <Link
      to="/transactions/$id"
      params={{ id: tx.id }}
      className="flex items-center gap-3 p-4 hover:bg-accent/50 active:bg-accent/50"
    >
      <div
        className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ background: tx.category?.color ?? "#888" }}
      >
        {tx.title.slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{tx.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {tx.category?.name ?? txTypeLabel[tx.type]} · {memberLabels[tx.entered_by]}
        </p>
      </div>
      <p
        className={cn("font-bold tabular-nums shrink-0", isIn ? "text-income" : "text-foreground")}
      >
        {isIn ? "+" : "−"}
        {formatILS(Number(tx.amount_ils))}
      </p>
    </Link>
  );
}

// Unused import guard: keep fetchAllTransactions referenced for tree-shake parity
void fetchAllTransactions;
