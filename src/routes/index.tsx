import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  fetchAllTransactions,
  fetchTransactionsBetween,
  type Transaction,
} from "@/lib/db";
import {
  categoryShade,
  currentMonthKey,
  formatILS,
  isCashflowOut,
  monthRangeFromKey,
  parseMonthKey,
  shiftMonth,
  txTypeLabel,
} from "@/lib/finance";
import { useMemberLabels } from "@/lib/person";
import { useMyProfile } from "@/lib/household";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "כסף משפחתי — דاשבורד" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [month, setMonth] = useState<string>(currentMonthKey());
  const { start, end, startDate } = useMemo(() => monthRangeFromKey(month), [month]);
  const { data: profile } = useMyProfile();
  const firstName = (profile?.display_name ?? "").split(" ")[0];

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["dashboard", "month", start],
    queryFn: () => fetchTransactionsBetween(start, end),
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

  const totals = useMemo(() => {
    let income = 0, expense = 0, fixed = 0, investment = 0;
    for (const t of txs) {
      const v = Number(t.amount_ils);
      switch (t.type) {
        case "income": income += v; break;
        case "expense": expense += v; break;
        case "fixed": fixed += v; break;
        // legacy "savings" transactions are treated as investments
        case "savings": investment += v; break;
        case "investment": investment += v; break;
      }
    }
    const remaining = income - expense - fixed - investment;
    return { income, expense, fixed, investment, remaining };
  }, [txs]);

  // Pie: outflow per category, each slice in its own colour
  const pieData = useMemo(() => {
    const m = new Map<string, { name: string; value: number; color: string }>();
    let i = 0;
    for (const t of txs) {
      if (!isCashflowOut(t.type)) continue;
      const key = t.category?.id ?? "other";
      const name = t.category?.name ?? "ללא קטגוריה";
      const baseColor = t.category?.color ?? "#888";
      const color = t.category ? categoryShade(baseColor, t.category.id, i++) : "#888";
      const prev = m.get(key);
      if (prev) prev.value += Number(t.amount_ils);
      else m.set(key, { name, value: Number(t.amount_ils), color });
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [txs]);

  // Top 5 categories (bar with category colors)
  const topCats = useMemo(() => pieData.slice(0, 5), [pieData]);

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
        income: 0, expense: 0, fixed: 0, investment: 0,
      });
    }
    for (const t of trendTxs) {
      const k = t.occurred_at.slice(0, 7);
      const b = buckets.get(k);
      if (!b) continue;
      // Fold legacy "savings" transactions into investment.
      const bucketKey = t.type === "savings" ? "investment" : t.type;
      if (bucketKey === "income" || bucketKey === "expense" || bucketKey === "fixed" || bucketKey === "investment") {
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
        <StatCard label="הכנסות" value={totals.income} className="bg-income/15 text-income" />
        <StatCard label="הוצאות" value={totals.expense} className="bg-expense/15 text-expense" />
        <StatCard label="קבועות" value={totals.fixed} className="bg-fixed/15 text-fixed" />
        <StatCard label="השקעה" value={totals.investment} className="bg-savings/25 text-foreground" />
      </section>

      <div className="grid md:grid-cols-2 gap-4 mt-6 px-5 md:px-0">
        <Card title="פילוח הוצאות לפי קטגוריה">
          {pieData.length === 0 ? (
            <Empty>אין עדיין הוצאות בחודש זה</Empty>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>
                      {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatILS(v)}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {pieData.slice(0, 8).map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate flex-1">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatILS(d.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Top 5 קטגוריות">
          {topCats.length === 0 ? (
            <Empty>אין נתונים</Empty>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCats} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(v: number) => formatILS(v)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {topCats.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

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
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="הכנסות" fill="var(--income)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="הוצאות" fill="var(--expense)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="fixed" name="קבועות" fill="var(--fixed)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="savings" name="חיסכון" fill="var(--savings)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="investment" name="השקעה" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="px-5 md:px-0 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">פעולות אחרונות</h2>
          <Link to="/transactions" className="text-xs text-primary">הצג הכל</Link>
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

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
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
      <p className={cn("font-bold tabular-nums shrink-0", isIn ? "text-income" : "text-foreground")}>
        {isIn ? "+" : "−"}{formatILS(Number(tx.amount_ils))}
      </p>
    </Link>
  );
}

// Unused import guard: keep fetchAllTransactions referenced for tree-shake parity
void fetchAllTransactions;
