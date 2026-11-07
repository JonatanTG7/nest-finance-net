import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { fetchTransactionsBetween, type Transaction } from "@/lib/db";
import { formatILS, isCashflowOut, parseMonthKey } from "@/lib/finance";
import { isoLocal, todayISO } from "@/lib/dates";
import { useCreditCards } from "@/lib/credit_cards";
import { useSubscriptions } from "@/lib/subscriptions";
import { monthEvents, type CalendarEvent } from "@/lib/calendar-events";
import { cn } from "@/lib/utils";

const DOW = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
type DayData = { out: number; inc: number; list: Transaction[] };

function money(amount: number, currency = "ILS") {
  if (currency === "ILS") return formatILS(Math.round(amount));
  return `${Math.round(amount).toLocaleString()} ${currency}`;
}

function EventIcons({ events }: { events: CalendarEvent[] }) {
  const has = (k: CalendarEvent["kind"]) => events.some((e) => e.kind === k);
  if (!events.length) return null;
  return (
    <span className="flex gap-0.5 text-[9px] leading-none mt-0.5">
      {has("salary") && <span>💰</span>}
      {has("card") && <span>💳</span>}
      {has("sub") && <span>🔁</span>}
    </span>
  );
}

export function MonthCalendar({ month, txs }: { month: string; txs: Transaction[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"month" | "week">("month");
  const [weekIdx, setWeekIdx] = useState(0);
  const today = todayISO();
  const { data: cards = [] } = useCreditCards();
  const { data: subs = [] } = useSubscriptions();

  const first = parseMonthKey(month);
  const y = first.getFullYear();
  const m = first.getMonth();
  // Previous month's credit purchases are charged on this month's billing days.
  const { data: cardTxs = [] } = useQuery({
    queryKey: ["transactions", "calendar-cards", month],
    queryFn: () => fetchTransactionsBetween(isoLocal(new Date(y, m - 1, 1)), isoLocal(new Date(y, m + 1, 1))),
  });

  const { cells, byDay, events, stats } = useMemo(() => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const byDay = new Map<string, DayData>();
    for (const t of txs) {
      const d = byDay.get(t.occurred_at) ?? { out: 0, inc: 0, list: [] };
      const v = Number(t.amount_ils);
      if (t.type === "income") d.inc += v;
      else if (isCashflowOut(t.type)) d.out += v;
      d.list.push(t);
      byDay.set(t.occurred_at, d);
    }
    const events = new Map<string, CalendarEvent[]>();
    for (const e of monthEvents(y, m, cards, subs, cardTxs)) {
      events.set(e.date, [...(events.get(e.date) ?? []), e]);
    }
    const cells: (string | null)[] = Array(first.getDay()).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(isoLocal(new Date(y, m, i)));
    while (cells.length % 7) cells.push(null);

    let noSpend = 0, total = 0, elapsed = 0;
    let heavy: { day: string; out: number } | null = null;
    for (const c of cells) {
      if (!c || c > today) continue;
      elapsed++;
      const out = byDay.get(c)?.out ?? 0;
      total += out;
      if (out === 0) noSpend++;
      if (out > 0 && (!heavy || out > heavy.out)) heavy = { day: c, out };
    }
    return { cells, byDay, events, stats: { noSpend, avg: elapsed ? total / elapsed : 0, heavy } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, txs, today, cards, subs, cardTxs]);

  const weeks = Math.ceil(cells.length / 7);
  const openExpanded = () => {
    const idx = cells.indexOf(today);
    setWeekIdx(idx >= 0 ? Math.floor(idx / 7) : 0);
    setExpanded(true);
  };

  const grid = (big: boolean) => (
    <div className="rounded-2xl bg-card border p-2">
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground mb-1">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const d = byDay.get(c);
          const ev = events.get(c) ?? [];
          const future = c > today;
          return (
            <button
              key={c}
              onClick={() => setSelected(c)}
              className={cn(
                "rounded-lg flex flex-col items-center justify-start pt-1 text-xs border border-transparent transition",
                big ? "min-h-20" : "aspect-square",
                d?.out ? "bg-destructive/10" : "bg-muted/30",
                future && !ev.length && "opacity-50",
                c === today && "border-primary ring-1 ring-primary",
                selected === c && "bg-primary/20",
              )}
            >
              <span className="font-semibold">{Number(c.slice(8))}</span>
              {d?.out ? (
                <span className="text-[9px] text-destructive leading-tight" dir="ltr">{Math.round(d.out).toLocaleString()}</span>
              ) : !future ? (
                <span className="text-[10px] text-income">✓</span>
              ) : null}
              {d?.inc ? <span className="size-1.5 rounded-full bg-income mt-0.5" /> : null}
              <EventIcons events={ev} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const weekView = () => {
    const days = cells.slice(weekIdx * 7, weekIdx * 7 + 7);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button aria-label="שבוע קודם" disabled={weekIdx === 0} onClick={() => setWeekIdx(weekIdx - 1)} className="p-2 disabled:opacity-30"><ChevronRight className="size-5" /></button>
          <span className="text-sm font-semibold">שבוע {weekIdx + 1} מתוך {weeks}</span>
          <button aria-label="שבוע הבא" disabled={weekIdx >= weeks - 1} onClick={() => setWeekIdx(weekIdx + 1)} className="p-2 disabled:opacity-30"><ChevronLeft className="size-5" /></button>
        </div>
        {days.map((c, i) => {
          if (!c) return null;
          const d = byDay.get(c);
          const ev = events.get(c) ?? [];
          return (
            <button key={c} onClick={() => setSelected(c)} className={cn("w-full text-right rounded-xl border bg-card p-3", c === today && "border-primary ring-1 ring-primary")}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">{DOW[i]}׳ · {Number(c.slice(8))}/{Number(c.slice(5, 7))}</span>
                <span className="text-xs">
                  {d?.inc ? <span className="text-income font-semibold ml-2">+{formatILS(Math.round(d.inc))}</span> : null}
                  {d?.out ? <span className="text-destructive font-semibold">-{formatILS(Math.round(d.out))}</span> : <span className="text-muted-foreground">אין הוצאות</span>}
                </span>
              </div>
              {d?.list.slice(0, 4).map((t) => (
                <div key={t.id} className="flex text-xs gap-2 py-0.5">
                  <span>{t.category?.emoji ?? "💸"}</span><span className="flex-1 truncate">{t.title}</span>
                </div>
              ))}
              {d && d.list.length > 4 && <div className="text-[11px] text-muted-foreground">ועוד {d.list.length - 4}…</div>}
              {ev.map((e, k) => <EventRow key={k} e={e} />)}
            </button>
          );
        })}
      </div>
    );
  };

  const sel = selected ? byDay.get(selected) : undefined;
  const selEvents = selected ? events.get(selected) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="ימים בלי הוצאות" value={`${stats.noSpend} 🎉`} />
        <Kpi label="ממוצע יומי" value={formatILS(Math.round(stats.avg))} />
        <Kpi label="היום הכבד" value={stats.heavy ? `${Number(stats.heavy.day.slice(8))} · ${formatILS(Math.round(stats.heavy.out))}` : "—"} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>💰 משכורת · 💳 חיוב אשראי · 🔁 קבועה</span>
        <button onClick={openExpanded} className="flex items-center gap-1 text-primary font-semibold">
          <Maximize2 className="size-3.5" /> הגדל
        </button>
      </div>
      {grid(false)}

      {expanded && (
        <div className="fixed inset-0 z-40 bg-background overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{first.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}</h2>
              <button onClick={() => setExpanded(false)} aria-label="סגור"><X className="size-6" /></button>
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-semibold">
              {(["month", "week"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={cn("rounded-lg py-2", view === v && "bg-card shadow")}>
                  {v === "month" ? "חודש" : "שבוע"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">💰 משכורת · 💳 חיוב אשראי · 🔁 קבועה · נקודה ירוקה = הכנסה</p>
            {view === "month" ? grid(true) : weekView()}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg bg-card border-t rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">
                {new Date(selected + "T00:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button onClick={() => setSelected(null)} aria-label="סגור"><X className="size-5" /></button>
            </div>
            {selEvents.length > 0 && (
              <div className="mb-4 rounded-xl bg-muted/40 p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1">צפוי ביום זה</div>
                {selEvents.map((e, k) => <EventRow key={k} e={e} />)}
              </div>
            )}
            <div className="text-xs font-semibold text-muted-foreground mb-1">תנועות בפועל</div>
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
            <Link to="/transactions/new" search={{ date: selected }} className="block text-center h-11 leading-[2.75rem] rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              + הוסף תנועה ביום זה
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: CalendarEvent }) {
  const icon = e.kind === "salary" ? "💰" : e.kind === "card" ? "💳" : e.emoji || "🔁";
  const amount = e.kind === "card" ? (e.amount > 0 ? formatILS(Math.round(e.amount)) : "") : e.kind === "sub" ? money(e.amount, e.currency) : "";
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span>{icon}</span>
      <span className="flex-1 truncate">{e.kind === "card" ? `חיוב ${e.label}` : e.label}</span>
      {amount && <span className="font-semibold" dir="auto">{amount}</span>}
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
