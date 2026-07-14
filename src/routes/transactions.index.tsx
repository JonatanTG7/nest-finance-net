import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MonthPicker } from "@/components/MonthPicker";
import { fetchTransactionsBetween, type Transaction } from "@/lib/db";
import { currentMonthKey, formatILS, monthRangeFromKey, txTypeLabel } from "@/lib/finance";
import { useMemberLabels } from "@/lib/person";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions/")({
  head: () => ({ meta: [{ title: "תנועות" }] }),
  component: TransactionsList,
});

type Filter = "all" | "income" | "expense" | "fixed" | "investment";

function TransactionsList() {
  const [month, setMonth] = useState<string>(currentMonthKey());
  const { start, end } = useMemo(() => monthRangeFromKey(month), [month]);
  const memberLabels = useMemberLabels();
  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["transactions", "month", start],
    queryFn: () => fetchTransactionsBetween(start, end),
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (filter !== "all" && t.type !== filter) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const tagsHay = (t.transaction_tags ?? []).map((tt) => tt.tag.name).join(" ");
        const hay = (t.title + " " + (t.note ?? "") + " " + (t.category?.name ?? "") + " " + tagsHay).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, filter, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = t.occurred_at;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">תנועות</h1>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, קטגוריה, תגית…"
          className="mt-3 w-full rounded-xl bg-card border px-4 h-11 text-base outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-3 flex gap-2 overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0 pb-1">
          {(
            [
              ["all", "הכל"],
              ["income", "הכנסות"],
              ["expense", "הוצאות"],
              ["fixed", "קבועות"],
              ["savings", "חיסכון"],
              ["investment", "השקעה"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-4 h-9 rounded-full text-sm whitespace-nowrap border transition",
                filter === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 md:px-0 mt-2">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
        ) : grouped.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">לא נמצאו תנועות</p>
        ) : (
          <ul className="space-y-5">
            {grouped.map(([date, items]) => (
              <li key={date}>
                <p className="text-xs text-muted-foreground mb-2 px-1">
                  {new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(date))}
                </p>
                <div className="rounded-2xl bg-card border divide-y">
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      to="/transactions/$id"
                      params={{ id: t.id }}
                      className="flex items-center gap-3 p-4 hover:bg-accent/50 active:bg-accent/50"
                    >
                      <div
                        className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: t.category?.color ?? "#888" }}
                      >
                        {t.title.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.category?.name ?? txTypeLabel[t.type]} · {memberLabels[t.entered_by]}
                        </p>
                      </div>
                      <p className={cn("font-bold tabular-nums shrink-0", t.type === "income" ? "text-income" : "text-foreground")}>
                        {t.type === "income" ? "+" : "−"}{formatILS(Number(t.amount_ils))}
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
