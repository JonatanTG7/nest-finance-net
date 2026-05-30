import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { fetchInvestmentAccounts, fetchInvestmentTransactions } from "@/lib/db";
import { formatILS } from "@/lib/finance";

export const Route = createFileRoute("/investments")({
  head: () => ({ meta: [{ title: "השקעות" }] }),
  component: Investments,
});

function Investments() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["investments", "txs"],
    queryFn: fetchInvestmentTransactions,
  });

  // Totals per account
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) {
      if (!t.investment_account_id) continue;
      m.set(t.investment_account_id, (m.get(t.investment_account_id) ?? 0) + Number(t.amount_ils));
    }
    return m;
  }, [txs]);

  const grand = useMemo(
    () => Array.from(totals.values()).reduce((a, b) => a + b, 0),
    [totals],
  );

  // Cumulative per month, per account
  const trend = useMemo(() => {
    if (txs.length === 0) return [];
    const months = new Set<string>();
    for (const t of txs) months.add(t.occurred_at.slice(0, 7));
    const sortedMonths = Array.from(months).sort();
    const running: Record<string, number> = {};
    return sortedMonths.map((mk) => {
      const row: Record<string, number | string> = { month: mk };
      for (const a of accounts) {
        running[a.id] = running[a.id] ?? 0;
      }
      for (const t of txs.filter((t) => t.occurred_at.slice(0, 7) === mk)) {
        if (!t.investment_account_id) continue;
        running[t.investment_account_id] = (running[t.investment_account_id] ?? 0) + Number(t.amount_ils);
      }
      for (const a of accounts) row[a.name] = running[a.id] ?? 0;
      return row;
    });
  }, [txs, accounts]);

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3">
        <h1 className="text-2xl font-bold">השקעות</h1>
        <p className="text-sm text-muted-foreground mt-1">
          סך ההפקדות לאורך זמן לפי חשבון. (זה מעקב תזרים — לא שווי שוק עדכני.)
        </p>
      </header>

      <section className="px-5 md:px-0">
        <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
          <p className="text-sm opacity-80">סך הפקדות כולל</p>
          <p className="text-4xl font-bold mt-2 tabular-nums">{formatILS(grand)}</p>
        </div>
      </section>

      <section className="px-5 md:px-0 mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: a.color }} />
              <p className="text-sm font-semibold">{a.name}</p>
            </div>
            <p className="text-2xl font-bold mt-2 tabular-nums">
              {formatILS(totals.get(a.id) ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {txs.filter((t) => t.investment_account_id === a.id).length} תנועות
            </p>
          </div>
        ))}
      </section>

      <section className="px-5 md:px-0 mt-6">
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">מצטבר לאורך זמן</h2>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              עוד אין תנועות השקעה. תוסיף תנועה מסוג "השקעה" ובחר חשבון.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => formatILS(Number(v))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {accounts.map((a) => (
                    <Line
                      key={a.id}
                      type="monotone"
                      dataKey={a.name}
                      stroke={a.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
