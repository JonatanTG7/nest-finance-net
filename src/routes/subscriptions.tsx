import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  deleteSubscription,
  monthStatus,
  saveSubscription,
  syncSubscriptions,
  useInvalidateSubscriptions,
  useSubscriptions,
  type Subscription,
  type SubscriptionInput,
} from "@/lib/subscriptions";
import { useMemberLabels, type Person } from "@/lib/person";
import { usePaymentMethods } from "@/lib/payment_methods";
import { cardLabel, isCreditMethod, useCreditCards } from "@/lib/credit_cards";
import { formatILS } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchRateToIls } from "@/lib/fx";
import { convertedSubscriptionTotals, installmentAmount } from "@/lib/finance-rules";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "מנויים והוראות קבע — Family Spend" },
      { name: "description", content: "כל המנויים, שכר הדירה וההוראות הקבע במקום אחד." },
      { property: "og:title", content: "מנויים והוראות קבע — Family Spend" },
      { property: "og:description", content: "כל המנויים וההוצאות הקבועות במקום אחד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { data: subs = [], isLoading } = useSubscriptions();
  const invalidate = useInvalidateSubscriptions();
  const labels = useMemberLabels();
  const { data: cards = [] } = useCreditCards();
  const { data: methods = [] } = usePaymentMethods();
  const [editing, setEditing] = useState<Subscription | "new" | null>(null);

  const rows = useMemo(
    () =>
      subs
        .map((s) => ({ s, st: monthStatus(s) }))
        .sort(
          (a, b) => Number(b.s.active) - Number(a.s.active) || a.st.date.localeCompare(b.st.date),
        ),
    [subs],
  );
  const live = rows.filter((r) => r.st.inRange);
  const currencies = [...new Set(live.map((r) => r.s.currency))].sort();
  const rates = useQuery({
    queryKey: ["fx", "subscriptions", currencies],
    queryFn: async () => Object.fromEntries(await Promise.all(currencies.map(async (c) => [c, await fetchRateToIls(c)] as const))),
    staleTime: 60 * 60 * 1000,
  });
  const totals = rates.data ? convertedSubscriptionTotals(live.map((r) => ({ ...r.s, charged: r.st.charged })), rates.data) : null;

  const toggle = async (s: Subscription) => {
    await saveSubscription({ ...s, active: !s.active }, s.id);
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
            <Plus className="size-4" /> מנוי חדש
          </Button>
        </div>
        <h1 className="text-2xl font-bold">מנויים והוראות קבע</h1>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="סה״כ בחודש · ₪" value={totals?.total ?? null} />
          <Stat label="כבר ירד · ₪" value={totals?.charged ?? null} />
          <Stat label="ממתין · ₪" value={totals?.pending ?? null} />
        </div>
        {rates.isError && <div role="alert" className="text-sm text-destructive">לא הצלחנו לטעון שערי מט״ח. <Button variant="ghost" size="sm" onClick={() => rates.refetch()}>נסה שוב</Button></div>}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">טוען…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            עוד אין מנויים. הוסיפו שכר דירה, אינטרנט, ביטוחים ומנויים — והם יירשמו אוטומטית ביום
            החיוב.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ s, st }) => {
              const card = cards.find((c) => c.id === s.credit_card_id);
              const method = methods.find((m) => m.key === s.payment_method)?.label;
              return (
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
                        {card ? ` · ${cardLabel(card)}` : method ? ` · ${method}` : ""}
                      </p>
                      {s.payment_count != null && <p className="text-xs text-muted-foreground">{st.completed ? "הסתיימו התשלומים" : st.paymentNumber > 0 ? `תשלום ${st.paymentNumber} מתוך ${s.payment_count}` : `${s.payment_count} תשלומים`}</p>}
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
                              : "bg-fixed/15 text-fixed",
                          )}
                        >
                          {st.charged
                            ? "ירד החודש"
                            : st.daysLeft === 0
                              ? "היום"
                              : `בעוד ${st.daysLeft} ימים`}
                        </span>
                      )}
                    </div>
                  </button>
                  <Switch checked={s.active} onCheckedChange={() => toggle(s)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing && (
        <SubscriptionDialog
          sub={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await syncSubscriptions().catch(() => 0);
            invalidate();
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl bg-fixed/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums text-sm">{value === null ? "—" : formatILS(value)}</p>
    </div>
  );
}

function SubscriptionDialog({
  sub,
  onClose,
  onSaved,
}: {
  sub: Subscription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labels = useMemberLabels();
  const { data: cards = [] } = useCreditCards();
  const { data: methods = [] } = usePaymentMethods();
  const [f, setF] = useState<SubscriptionInput>(
    sub ?? {
      name: "",
      emoji: "🔁",
      category_id: null,
      amount: 0,
      currency: "ILS",
      billing_day: new Date().getDate(),
      entered_by: "shared",
      payment_method: "standing",
      credit_card_id: null,
      start_date: todayISO(),
      end_date: null,
      payment_count: null,
      active: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<"unlimited" | "count" | "date">(sub?.payment_count != null ? "count" : sub?.end_date ? "date" : "unlimited");
  const [amountMode, setAmountMode] = useState<"payment" | "total">("payment");
  let paymentAmount = f.amount;
  let splitError = "";
  if (duration === "count" && amountMode === "total") {
    try { paymentAmount = installmentAmount(f.amount, f.payment_count ?? 0); }
    catch (e) { splitError = (e as Error).message; }
  }
  const invalidate = useInvalidateSubscriptions();
  useEffect(() => {
    if (!isCreditMethod(f.payment_method) && f.credit_card_id)
      setF((p) => ({ ...p, credit_card_id: null }));
  }, [f.payment_method, f.credit_card_id]);

  const set = <K extends keyof SubscriptionInput>(k: K, v: SubscriptionInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !(f.amount > 0)) return toast.error("צריך שם וסכום");
    if (splitError) return toast.error(splitError);
    setBusy(true);
    try {
      await saveSubscription({ ...f, amount: paymentAmount, name: f.name.trim(), payment_count: duration === "count" ? f.payment_count ?? 0 : null, end_date: duration === "date" ? f.end_date : null }, sub?.id);
      toast.success("נשמר");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!sub || !window.confirm("למחוק את המנוי? תנועות שכבר נרשמו יישארו.")) return;
    await deleteSubscription(sub.id);
    invalidate();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub ? "עריכת מנוי" : "מנוי חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              className="w-16 text-center text-xl"
              value={f.emoji}
              onChange={(e) => set("emoji", e.target.value)}
            />
            <Input
              placeholder="שם (נטפליקס, שכר דירה…)"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder={duration === "count" && amountMode === "total" ? "סכום כולל" : "סכום לכל תשלום"}
              aria-label={duration === "count" && amountMode === "total" ? "סכום כולל" : "סכום לכל תשלום"}
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
            יום חיוב בחודש
            <Input
              type="number"
              min={1}
              max={31}
              value={f.billing_day}
              onChange={(e) => set("billing_day", Number(e.target.value))}
            />
          </label>
          <div>
            <p className="text-sm mb-1">שולם ע״י</p>
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
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={f.payment_method ?? ""}
            onChange={(e) => set("payment_method", e.target.value || null)}
          >
            <option value="">אמצעי תשלום</option>
            {methods.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          {isCreditMethod(f.payment_method) && (
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={f.credit_card_id ?? ""}
              onChange={(e) => set("credit_card_id", e.target.value || null)}
            >
              <option value="">בחר כרטיס</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {cardLabel(c)}
                </option>
              ))}
            </select>
          )}
          <div className="space-y-3 text-sm">
            <label>
              תחילת המנוי
              <Input
                type="date"
                value={f.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </label>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="משך המנוי">
              {([{ key: "unlimited", label: "ללא הגבלה" }, { key: "count", label: "מס׳ תשלומים" }, { key: "date", label: "תאריך סיום" }] as const).map(({ key, label }) => (
                <Button key={key} type="button" size="sm" variant={duration === key ? "default" : "outline"} aria-pressed={duration === key} onClick={() => { setDuration(key); if (key === "count" && f.payment_count == null) set("payment_count", 5); }}>{label}</Button>
              ))}
            </div>
            {duration === "count" && <label className="block">
              מספר תשלומים
              <Input type="number" min={1} step={1} value={f.payment_count ?? ""} onChange={(e) => set("payment_count", e.target.value === "" ? null : Number(e.target.value))} />
            </label>}
            {duration === "count" && <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="סוג הסכום">
                <Button type="button" size="sm" variant={amountMode === "payment" ? "default" : "outline"} aria-pressed={amountMode === "payment"} onClick={() => { if (amountMode === "total" && !splitError) set("amount", paymentAmount); setAmountMode("payment"); }}>סכום לכל תשלום</Button>
                <Button type="button" size="sm" variant={amountMode === "total" ? "default" : "outline"} aria-pressed={amountMode === "total"} onClick={() => { if (amountMode === "payment") set("amount", Math.round(f.amount * (f.payment_count ?? 1) * 100) / 100); setAmountMode("total"); }}>סכום כולל</Button>
              </div>
              {amountMode === "total" && f.amount > 0 && <p className={splitError ? "text-destructive" : "text-muted-foreground"} role="status">{splitError || `${f.payment_count} תשלומים × ${new Intl.NumberFormat("he-IL", { style: "currency", currency: f.currency }).format(paymentAmount)}`}</p>}
            </div>}
            {duration === "date" && <label className="block">
              תאריך סיום
              <Input
                type="date"
                value={f.end_date ?? ""}
                onChange={(e) => set("end_date", e.target.value || null)}
              />
            </label>}
          </div>
          <p className="text-xs text-muted-foreground">
            התנועה תירשם אוטומטית רק ביום החיוב עצמו. שינוי סכום חל מעכשיו והלאה.
          </p>
        </div>
        <DialogFooter className="gap-2">
          {sub && (
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
