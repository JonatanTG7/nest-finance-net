import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { MobileLayout } from "@/components/MobileLayout";
import {
  fetchTransactionsBetween,
  type Transaction,
} from "@/lib/db";
import {
  formatILS,
  formatMonthHebrew,
  isCashflowOut,
  monthRange,
  txTypeLabel,
} from "@/lib/finance";
import { personLabel } from "@/lib/person";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "כסף משפחתי — דאשבורד" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { start, end, startDate } = useMemo(() => monthRange(), []);
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["dashboard", "month", start],
    queryFn: () => fetchTransactionsBetween(start, end),
  });

  const totals = useMemo(() => {
    let income = 0,
      expense = 0,
      fixed = 0,
      savings = 0,
      investment = 0;
    for (const t of txs) {
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
        case "savings":
          savings += v;
          break;
        case "investment":
          investment += v;
          break;
      }
    }
    const remaining = income - expense - fixed;
    return { income, expense, fixed, savings, investment, remaining };
  }, [txs]);

  const pieData = useMemo(() => {
    const m = new Map<string, { name: string; value: number; color: string }>();
    for (const t of txs) {
      if (!isCashflowOut(t.type)) continue;
      const key = t.category?.id ?? "other";
      const name = t.category?.name ?? "ללא קטגוריה";
      const color = t.category?.color ?? "#888";
      const prev = m.get(key);
      if (prev) prev.value += Number(t.amount_ils);
      else m.set(key, { name, value: Number(t.amount_ils), color });
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [txs]);

  return (
    <MobileLayout>
      <header className="px-5 pt-6 pb-3">
        <p className="text-sm text-muted-foreground">שלום יונתן ושירי 👋</p>
        <h1 className="text-2xl font-bold mt-1">{formatMonthHebrew(startDate)}</h1>
      </header>

      {/* Hero: remaining */}
      <section className="px-5">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6 shadow-lg shadow-primary/20">
          <p className="text-sm opacity-90">פנוי לחודש</p>
          <p className="text-4xl font-bold mt-2 tabular-nums">
            {formatILS(totals.remaining)}
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <div>
              <p className="opacity-80">הכנסות</p>
              <p className="font-semibold tabular-nums">{formatILS(totals.income)}</p>
            </div>
            <div>
              <p className="opacity-80">הוצאות</p>
              <p className="font-semibold tabular-nums">
                {formatILS(totals.expense + totals.fixed)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        <StatCard label="הכנסות" value={totals.income} className="bg-income/15 text-income" />
        <StatCard label="הוצאות שוטפות" value={totals.expense} className="bg-expense/15 text-expense" />
        <StatCard label="הוצאות קבועות" value={totals.fixed} className="bg-fixed/15 text-fixed" />
        <StatCard
          label="חיסכון/השקעה"
          value={totals.savings + totals.investment}
          className="bg-savings/20 text-foreground"
        />
      </section>

      {/* Pie */}
      <section className="px-5 mt-6">
        <h2 className="text-base font-semibold mb-3">פילוח הוצאות</h2>
        <div className="rounded-2xl bg-card border p-4">
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              אין עדיין הוצאות בחודש זה
            </p>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatILS(v)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {pieData.slice(0, 6).map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: d.color }}
                    />
                    <span className="truncate flex-1">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatILS(d.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Recent activity */}
      <section className="px-5 mt-6">
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
              אין עדיין תנועות. לחץ על + כדי להוסיף את הראשונה.
            </div>
          ) : (
            txs.slice(0, 8).map((t) => <TxRow key={t.id} tx={t} />)
          )}
        </div>
      </section>
    </MobileLayout>
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
  return (
    <Link
      to="/transactions/$id"
      params={{ id: tx.id }}
      className="flex items-center gap-3 p-4 active:bg-accent/50"
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
          {tx.category?.name ?? txTypeLabel[tx.type]} · {personLabel[tx.entered_by]}
        </p>
      </div>
      <p
        className={cn(
          "font-bold tabular-nums shrink-0",
          isIn ? "text-income" : "text-foreground",
        )}
      >
        {isIn ? "+" : "−"}
        {formatILS(Number(tx.amount_ils))}
      </p>
    </Link>
  );
}
