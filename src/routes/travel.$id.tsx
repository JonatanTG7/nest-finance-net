import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight, Pencil, TrendingUp, Trophy } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TripDialog } from "@/components/travel/TripDialog";
import { fetchTransactionsByTrip } from "@/lib/db";
import { formatMoney, categoryShade } from "@/lib/finance";
import {
  countryFlag,
  deleteTrip,
  fetchTrip,
  formatTripRange,
  tripDays,
  tripGradient,
  tripStatus,
  tripStatusLabel,
  updateTrip,
  useInvalidateTrips,
  type TripInput,
} from "@/lib/trips";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/travel/$id")({
  head: () => ({
    meta: [
      { title: "מסך הטיול — מרכז הטיולים" },
      { name: "description", content: "תקציב, ניתוח קטגוריות וציר זמן הוצאות של הטיול." },
      { property: "og:title", content: "מסך הטיול — מרכז הטיולים" },
      { property: "og:description", content: "תקציב, ניתוח קטגוריות וציר זמן הוצאות של הטיול." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripDetails,
});

function TripDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateTrips();
  const [editOpen, setEditOpen] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", id],
    queryFn: () => fetchTrip(id),
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["trip", id, "transactions"],
    queryFn: () => fetchTransactionsByTrip(id),
    enabled: !!id,
  });

  const stats = useMemo(() => {
    const expenses = txs.filter((t) => t.type !== "income");
    const spent = expenses.reduce((s, t) => s + Number(t.amount_ils), 0);
    const byCat = new Map<string, { name: string; emoji: string; color: string; total: number }>();
    for (const t of expenses) {
      const key = t.category_id ?? "other";
      const prev = byCat.get(key);
      const total = (prev?.total ?? 0) + Number(t.amount_ils);
      byCat.set(key, {
        name: t.category?.name ?? "אחר",
        emoji: t.category?.emoji ?? "•",
        color: t.category?.color ?? "#888888",
        total,
      });
    }
    const cats = [...byCat.entries()]
      .map(([id, v], i) => ({ id, ...v, fill: categoryShade(v.color, id, i) }))
      .sort((a, b) => b.total - a.total);
    const largest = expenses.reduce<typeof expenses[number] | null>(
      (max, t) => (!max || Number(t.amount_ils) > Number(max.amount_ils) ? t : max),
      null,
    );
    return { expenses, spent, cats, largest };
  }, [txs]);

  async function save(input: TripInput) {
    await updateTrip(id, input);
    invalidate();
    toast.success("הטיול עודכן");
  }

  async function remove() {
    await deleteTrip(id);
    invalidate();
    toast.success("הטיול נמחק");
    navigate({ to: "/travel" });
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="p-10 text-center text-sm text-muted-foreground">טוען…</p>
      </AppShell>
    );
  }
  if (!trip) {
    return (
      <AppShell>
        <p className="p-10 text-center text-sm text-muted-foreground">הטיול לא נמצא</p>
      </AppShell>
    );
  }

  const cur = trip.currency;
  const budget = Number(trip.budget) || 0;
  const spent = stats.spent;
  const remaining = budget - spent;
  const days = tripDays(trip);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const avgDaily = spent / days;
  const remainingDaily = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const left =
      today < trip.start_date
        ? days
        : Math.max(
            0,
            Math.round(
              (new Date(trip.end_date + "T00:00:00").getTime() -
                new Date(today + "T00:00:00").getTime()) /
                86400000,
            ) + 1,
          );
    return left > 0 ? Math.max(0, remaining) / left : 0;
  })();

  return (
    <AppShell>
      <div className="pb-10">
        {/* Hero */}
        <div
          className="relative overflow-hidden md:rounded-3xl"
          style={{ background: tripGradient(trip.id) }}
        >
          {trip.cover_image && (
            <img
              src={trip.cover_image}
              alt={trip.name}
              className="absolute inset-0 size-full object-cover opacity-70"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
          <div className="relative p-5 pt-6 text-white">
            <div className="flex items-center justify-between">
              <Link
                to="/travel"
                className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
                aria-label="חזרה"
              >
                <ChevronRight className="size-5" />
              </Link>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
                aria-label="עריכת טיול"
              >
                <Pencil className="size-4" />
              </button>
            </div>

            <div className="mt-5">
              <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur">
                {tripStatusLabel[tripStatus(trip)]}
              </span>
              <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
                <span>{countryFlag(trip.country)}</span>
                {trip.name}
              </h1>
              {trip.cities && <p className="text-sm text-white/80">{trip.cities}</p>}
              <p className="mt-0.5 text-xs text-white/70">
                {formatTripRange(trip)} · {days} ימים
              </p>
            </div>

            <div className="mt-5">
              <div className="flex items-end justify-between text-sm font-semibold tabular-nums">
                <span>{formatMoney(spent, cur)}</span>
                <span className="text-white/70">{formatMoney(budget, cur)}</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700 ease-out",
                    remaining < 0 ? "bg-rose-400" : "bg-emerald-400",
                  )}
                  style={{ width: `${budget > 0 ? Math.max(pct, spent > 0 ? 4 : 0) : 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-white/75">
                {budget > 0 ? `${Math.round(pct)}% מהתקציב נוצלו` : "לא הוגדר תקציב"}
              </p>
            </div>
          </div>
        </div>

        {/* Overview grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 px-5 md:grid-cols-3 md:px-0">
          <Stat label="תקציב" value={formatMoney(budget, cur)} />
          <Stat label="הוצא" value={formatMoney(spent, cur)} />
          <Stat
            label="נותר"
            value={formatMoney(remaining, cur)}
            tone={remaining < 0 ? "bad" : "good"}
          />
          <Stat label="תנועות" value={String(stats.expenses.length)} />
          <Stat label="ממוצע ליום" value={formatMoney(avgDaily, cur)} />
          <Stat label="תקציב יומי שנותר" value={formatMoney(remainingDaily, cur)} />
        </div>

        {/* Analytics */}
        {stats.cats.length > 0 && (
          <div className="mt-4 px-5 md:px-0">
            <div className="rounded-3xl border bg-card p-5">
              <h2 className="text-sm font-bold text-muted-foreground">התפלגות לפי קטגוריה</h2>
              <div className="mt-3 flex flex-col items-center gap-4 md:flex-row">
                <div className="h-52 w-full md:w-1/2" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.cats}
                        dataKey="total"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="88%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {stats.cats.map((c) => (
                          <Cell key={c.id} fill={c.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => formatMoney(Number(v), cur)}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--card))",
                          color: "hsl(var(--foreground))",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-2 md:w-1/2">
                  {stats.cats.slice(0, 8).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: c.fill }} />
                      <span className="flex-1 truncate">
                        {c.emoji} {c.name}
                      </span>
                      <span className="tabular-nums font-semibold">
                        {formatMoney(c.total, cur)}
                      </span>
                      <span className="w-10 text-left text-xs text-muted-foreground tabular-nums">
                        {spent > 0 ? Math.round((c.total / spent) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Trophy className="size-3.5" /> הקטגוריה היקרה
                </p>
                <p className="mt-1 text-base font-bold">
                  {stats.cats[0].emoji} {stats.cats[0].name}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatMoney(stats.cats[0].total, cur)}
                </p>
              </div>
              {stats.largest && (
                <Link
                  to="/transactions/$id"
                  params={{ id: stats.largest.id }}
                  className="rounded-3xl border bg-card p-4 transition active:scale-[0.99]"
                >
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="size-3.5" /> התנועה הגדולה
                  </p>
                  <p className="mt-1 truncate text-base font-bold">{stats.largest.title}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatMoney(Number(stats.largest.amount_ils), cur)}
                  </p>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="mt-4 px-5 md:px-0">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">ציר ההוצאות</h2>
          {txs.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              עדיין אין תנועות משויכות לטיול. בטופס התנועה בחרו את הטיול הזה.
            </div>
          ) : (
            <ul className="space-y-2">
              {txs.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/transactions/edit/$id"
                    params={{ id: t.id }}
                    className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition active:scale-[0.99]"
                  >
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{ background: (t.category?.color ?? "#888888") + "22" }}
                    >
                      {t.category?.emoji ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.category?.name ?? "אחר"} ·{" "}
                        {new Intl.DateTimeFormat("he-IL", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(t.occurred_at + "T00:00:00"))}
                        {t.payment_method ? ` · ${t.payment_method}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {formatMoney(Number(t.amount_ils), cur)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <TripDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        trip={trip}
        onSave={save}
        onDelete={remove}
      />
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-base font-bold tabular-nums",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
