import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { Transaction } from "@/lib/db";
import { formatILS, isCashflowOut, parseMonthKey } from "@/lib/finance";
import { isoLocal, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DOW = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export function MonthCalendar({ month, txs }: { month: string; txs: Transaction[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const today = todayISO();

  const { cells, byDay, stats } = useMemo(() => {
    const first = parseMonthKey(month);
    const y = first.getFullYear();
    const m = first.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const byDay = new Map<string, { out: number; inc: number; list: Transaction[] }>();
    for (const t of txs) {
      const d = byDay.get(t.occurred_at) ?? { out: 0, inc: 0, list: [] };
      const v = Number(t.amount_ils);
      if (t.type === "income") d.inc += v;
      else if (isCashflowOut(t.type)) d.out += v;
      d.list.push(t);
      byDay.set(t.occurred_at, d);
    }
    const cells: (string | null)[] = Array(first.getDay()).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(isoLocal(new Date(y, m, i)));
    while (cells.length % 7) cells.push(null);

    let noSpend = 0;
    let total = 0;
    let elapsed = 0;
    let heavy: { day: string; out: number } | null = null;
    for (const c of cells) {
      if (!c || c > today) continue;
      elapsed++;
      const out = byDay.get(c)?.out ?? 0;
      total += out;
      if (out === 0) noSpend++;
      if (out > 0 && (!heavy || out > heavy.out)) heavy = { day: c, out };
    }
    return {
      cells,
      byDay,
      stats: { noSpend, avg: elapsed ? total / elapsed : 0, heavy },
    };
  }, [month, txs, today]);

  const sel = selected ? byDay.get(selected) : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="ימים בלי הוצאות" value={`${stats.noSpend} 🎉`} />
        <Kpi label="ממוצע יומי" value={formatILS(Math.round(stats.avg))} />
        <Kpi
          label="היום הכבד"
          value={stats.heavy ? `${Number(stats.heavy.day.slice(8))} · ${formatILS(Math.round(stats.heavy.out))}` : "—"}
        />
      </div>

      <div className="rounded-2xl bg-card border p-2">
        <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground mb-1">
          {DOW.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const d = byDay.get(c);
            const future = c > today;
            const noSpend = !future && !d?.out;
            return (
              <button
                key={c}
                onClick={() => setSelected(c)}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-start pt-1 text-xs border border-transparent transition",
                  d?.out ? "bg-destructive/10" : "bg-muted/30",
                  future && "opacity-50",
                  c === today && "border-primary ring-1 ring-primary",
                  selected === c && "bg-primary/20",
                )}
              >
                <span className="font-semibold">{Number(c.slice(8))}</span>
                {d?.out ? (
                  <span className="text-[9px] text-destructive leading-tight" dir="ltr">
                    {Math.round(d.out).toLocaleString()}
                  </span>
                ) : noSpend ? (
                  <span className="text-[10px] text-income">✓</span>
                ) : null}
                {d?.inc ? <span className="size-1.5 rounded-full bg-income mt-0.5" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg bg-card border-t rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">
                {new Date(selected + "T00:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button onClick={() => setSelected(null)} aria-label="סגור"><X className="size-5" /></button>
            </div>
            {sel?.list.length ? (
              <ul className="divide-y mb-4">
                {sel.list.map((t) => (
                  <li key={t.id}>
                    <Link to="/transactions/$id" params={{ id: t.id }} className="flex items-center gap-3 py-3">
                      <span className="text-xl">{t.category?.emoji ?? "💸"}</span>
                      <span className="flex-1 truncate text-sm">{t.title}</span>
                      <span className={cn("text-sm font-semibold", t.type === "income" ? "text-income" : "")}>
                        {formatILS(t.type === "income" ? Number(t.amount_ils) : -Number(t.amount_ils))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">אין תנועות ביום הזה ✨</p>
            )}
            <Link
              to="/transactions/new"
              search={{ date: selected }}
              className="block text-center h-11 leading-[2.75rem] rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              + הוסף תנועה ביום זה
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card border p-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold mt-0.5" dir="auto">{value}</div>
    </div>
  );
}
