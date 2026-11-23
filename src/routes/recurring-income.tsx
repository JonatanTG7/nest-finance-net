import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecurringTabs } from "@/components/RecurringTabs";
import {
  deleteRecurringIncome,
  monthStatus,
  saveRecurringIncome,
  syncRecurringIncome,
  useInvalidateRecurringIncome,
  useRecurringIncome,
  type RecurringIncome,
  type RecurringIncomeInput,
} from "@/lib/recurring-income";
import { useMemberLabels, type Person } from "@/lib/person";
import { formatILS } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchRateToIls } from "@/lib/fx";
import { convertedRecurringTotals, installmentAmount } from "@/lib/finance-rules";

export const Route = createFileRoute("/recurring-income")({
  head: () => ({
    meta: [
      { title: "הכנסות קבועות — Family Spend" },
      {
        name: "description",
        content: "כל ההכנסות החוזרות — קצבאות, שכר דירה נכנס ועוד — במקום אחד.",
      },
      { property: "og:title", content: "הכנסות קבועות — Family Spend" },
      { property: "og:description", content: "כל ההכנסות הקבועות במקום אחד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecurringIncomePage,
});

function RecurringIncomePage() {
  const { data: items = [], isLoading } = useRecurringIncome();
  const invalidate = useInvalidateRecurringIncome();
  const labels = useMemberLabels();
  const [editing, setEditing] = useState<RecurringIncome | "new" | null>(null);

  const rows = useMemo(
    () =>
      items
        .map((s) => ({ s, st: monthStatus(s) }))
        .sort(
          (a, b) => Number(b.s.active) - Number(a.s.active) || a.st.date.localeCompare(b.st.date),
        ),
    [items],
  );
  const live = rows.filter((r) => r.st.inRange);
  const currencies = [...new Set(live.map((r) => r.s.currency))].sort();
  const rates = useQuery({
    queryKey: ["fx", "recurring-income", currencies],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(currencies.map(async (c) => [c, await fetchRateToIls(c)] as const)),
      ),
    staleTime: 60 * 60 * 1000,
  });
  const totals = rates.data
    ? convertedRecurringTotals(
        live.map((r) => ({ ...r.s, charged: r.st.charged })),
        rates.data,
      )
    : null;

  const toggle = async (s: RecurringIncome) => {
    await saveRecurringIncome({ ...s, active: !s.active }, s.id);
    invalidate();
  };

  return (
    <AppShell>
      <div className="px-5 md:px-0 pt-4 space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowRight className="size-4" /> לדף הבית
          </Link>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> הכנסה חדשה
          </Button>
        </div>
        <h1 className="text-2xl font-bold">הכנסות קבועות</h1>
        <RecurringTabs active="income" />

        <div className="grid grid-cols-3 gap-2">
          <Stat label="סה״כ בחודש · ₪" value={totals?.total ?? null} />
          <Stat label="כבר נכנס · ₪" value={totals?.charged ?? null} />
          <Stat label="ממתין · ₪" value={totals?.pending ?? null} />
        </div>
        {rates.isError && (
          <div role="alert" className="text-sm text-destructive">
            לא הצלחנו לטעון שערי מט״ח.{" "}
            <Button variant="ghost" size="sm" onClick={() => rates.refetch()}>
              נסה שוב
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">טוען…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            עוד אין הכנסות קבועות. הוסיפו קצבאות, שכר דירה נכנס והכנסות חוזרות — והן יירשמו אוטומטית
            ביום הכניסה.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ s, st }) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-2xl border bg-card p-3 flex items-center gap-3",
                  !s.active && "opacity-50",
                )}
              >
                <button
                  className="flex-1 flex items-center gap-3 text-start min-w-0"
                  onClick={() => setEditing(s)}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      כל {s.billing_day} לחודש · {labels[s.entered_by]}
                    </p>
                    {s.payment_count != null && (
                      <p className="text-xs text-muted-foreground">
                        {st.completed
                          ? "ההכנסה הסתיימה"
                          : st.paymentNumber > 0
                            ? `פעם ${st.paymentNumber} מתוך ${s.payment_count}`
                            : `${s.payment_count} פעמים`}
                      </p>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-bold tabular-nums">
                      {s.currency === "ILS" ? formatILS(s.amount) : `${s.amount} ${s.currency}`}
                    </p>
                    {s.active && st.inRange && (
                      <span
                        className={cn(
                          "text-[11px] rounded-full px-2 py-0.5",
                          st.charged
                            ? "bg-muted text-muted-foreground"
                            : "bg-income/15 text-income",
                        )}
                      >
                        {st.charged
                          ? "נכנס החודש"
                          : st.daysLeft === 0
                            ? "היום"
                            : `בעוד ${st.daysLeft} ימים`}
                      </span>
                    )}
                  </div>
                </button>
                <Switch checked={s.active} onCheckedChange={() => toggle(s)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <RecurringIncomeDialog
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await syncRecurringIncome().catch(() => 0);
            invalidate();
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl bg-income/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums text-sm">{value === null ? "—" : formatILS(value)}</p>
    </div>
  );
}

function RecurringIncomeDialog({
  item,
  onClose,
  onSaved,
}: {
  item: RecurringIncome | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labels = useMemberLabels();
  const [f, setF] = useState<RecurringIncomeInput>(
    item ?? {
      name: "",
      emoji: "💰",
      category_id: null,
      amount: 0,
      currency: "ILS",
      billing_day: new Date().getDate(),
      entered_by: "shared",
      start_date: todayISO(),
      end_date: null,
      payment_count: null,
      active: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<"unlimited" | "count" | "date">(
    item?.payment_count != null ? "count" : item?.end_date ? "date" : "unlimited",
  );
  const [amountMode, setAmountMode] = useState<"payment" | "total">("payment");
  let paymentAmount = f.amount;
  let splitError = "";
  if (duration === "count" && amountMode === "total") {
    try {
      paymentAmount = installmentAmount(f.amount, f.payment_count ?? 0);
    } catch (e) {
      splitError = (e as Error).message;
    }
  }
  const invalidate = useInvalidateRecurringIncome();

  const set = <K extends keyof RecurringIncomeInput>(k: K, v: RecurringIncomeInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !(f.amount > 0)) return toast.error("צריך שם וסכום");
    if (splitError) return toast.error(splitError);
    setBusy(true);
    try {
      await saveRecurringIncome(
        {
          ...f,
          amount: paymentAmount,
          name: f.name.trim(),
          payment_count: duration === "count" ? (f.payment_count ?? 0) : null,
          end_date: duration === "date" ? f.end_date : null,
        },
        item?.id,
      );
      toast.success("נשמר");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item || !window.confirm("למחוק את ההכנסה הקבועה? תנועות שכבר נרשמו יישארו.")) return;
    await deleteRecurringIncome(item.id);
    invalidate();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "עריכת הכנסה קבועה" : "הכנסה קבועה חדשה"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              className="w-16 text-center text-xl"
              value={f.emoji}
              onChange={(e) => set("emoji", e.target.value)}
            />
            <Input
              placeholder="שם (קצבת ילדים, שכר דירה…)"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder={
                duration === "count" && amountMode === "total" ? "סכום כולל" : "סכום לכל חודש"
              }
              aria-label={
                duration === "count" && amountMode === "total" ? "סכום כולל" : "סכום לכל חודש"
              }
              value={f.amount || ""}
              onChange={(e) => set("amount", Number(e.target.value))}
            />
            <select
              className="rounded-md border bg-background px-2"
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {["ILS", "USD", "EUR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className="block text-sm">
            יום כניסה בחודש
            <Input
              type="number"
              min={1}
              max={31}
              value={f.billing_day}
              onChange={(e) => set("billing_day", Number(e.target.value))}
            />
          </label>
          <div>
            <p className="text-sm mb-1">התקבל ע״י</p>
            <div className="grid grid-cols-3 gap-2">
              {(["yonatan", "shiri", "shared"] as Person[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={f.entered_by === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("entered_by", p)}
                >
                  {labels[p]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <label>
              תחילת ההכנסה
              <Input
                type="date"
                value={f.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </label>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="משך ההכנסה">
              {(
                [
                  { key: "unlimited", label: "ללא הגבלה" },
                  { key: "count", label: "מספר פעמים" },
                  { key: "date", label: "תאריך סיום" },
                ] as const
              ).map(({ key, label }) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={duration === key ? "default" : "outline"}
                  aria-pressed={duration === key}
                  onClick={() => {
                    setDuration(key);
                    if (key === "count" && f.payment_count == null) set("payment_count", 5);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            {duration === "count" && (
              <label className="block">
                מספר פעמים
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={f.payment_count ?? ""}
                  onChange={(e) =>
                    set("payment_count", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </label>
            )}
            {duration === "count" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="סוג הסכום">
                  <Button
                    type="button"
                    size="sm"
                    variant={amountMode === "payment" ? "default" : "outline"}
                    aria-pressed={amountMode === "payment"}
                    onClick={() => {
                      if (amountMode === "total" && !splitError) set("amount", paymentAmount);
                      setAmountMode("payment");
                    }}
                  >
                    סכום לכל חודש
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={amountMode === "total" ? "default" : "outline"}
                    aria-pressed={amountMode === "total"}
                    onClick={() => {
                      if (amountMode === "payment")
                        set("amount", Math.round(f.amount * (f.payment_count ?? 1) * 100) / 100);
                      setAmountMode("total");
                    }}
                  >
                    סכום כולל
                  </Button>
                </div>
                {amountMode === "total" && f.amount > 0 && (
                  <p
                    className={splitError ? "text-destructive" : "text-muted-foreground"}
                    role="status"
                  >
                    {splitError ||
                      `${f.payment_count} פעמים × ${new Intl.NumberFormat("he-IL", { style: "currency", currency: f.currency }).format(paymentAmount)}`}
                  </p>
                )}
              </div>
            )}
            {duration === "date" && (
              <label className="block">
                תאריך סיום
                <Input
                  type="date"
                  value={f.end_date ?? ""}
                  onChange={(e) => set("end_date", e.target.value || null)}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            התנועה תירשם אוטומטית רק ביום הכניסה עצמו. שינוי סכום חל מעכשיו והלאה.
          </p>
        </div>
        <DialogFooter className="gap-2">
          {item && (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              מחק
            </Button>
          )}
          <Button onClick={save} disabled={busy}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
