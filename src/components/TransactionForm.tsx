import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchInvestmentAccounts,
  fetchTags,
  updateTransaction,
  type Transaction,
  type TransactionInput,
} from "@/lib/db";
import { txTypeLabel } from "@/lib/finance";
import { getDefaultPerson, personLabel, setDefaultPerson, type Person } from "@/lib/person";
import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/finance";
import type { PaymentMethod } from "@/lib/db";

const TYPES: TxType[] = ["expense", "income", "fixed", "savings", "investment"];
const CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "מזומן" },
  { value: "credit", label: "אשראי" },
  { value: "standing_order", label: "הוראת קבע" },
];

export function TransactionForm({
  existing,
  onDone,
}: {
  existing?: Transaction;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });

  const [type, setType] = useState<TxType>(existing?.type ?? "expense");
  const [amount, setAmount] = useState<string>(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState(existing?.currency ?? "ILS");
  const [fx, setFx] = useState<string>(existing ? String(existing.fx_rate_to_ils) : "1");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [accountId, setAccountId] = useState<string | null>(existing?.investment_account_id ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [date, setDate] = useState(existing?.occurred_at ?? new Date().toISOString().slice(0, 10));
  const [enteredBy, setEnteredBy] = useState<Person>(existing?.entered_by ?? getDefaultPerson());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    (existing as unknown as { payment_method?: PaymentMethod | null })?.payment_method ?? null,
  );
  const [tagInput, setTagInput] = useState("");
  const [tagList, setTagList] = useState<string[]>(
    existing?.transaction_tags?.map((tt) => tt.tag.name) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  // Auto-link investment category → account
  useEffect(() => {
    if (type !== "investment" || !categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.investment_account_id) {
      setAccountId(cat.investment_account_id);
    }
  }, [type, categoryId, categories]);

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return tags
      .map((t) => t.name)
      .filter((n) => n.toLowerCase().includes(q) && !tagList.includes(n))
      .slice(0, 6);
  }, [tagInput, tags, tagList]);

  function addTag(name: string) {
    const t = name.trim();
    if (!t || tagList.includes(t)) return;
    setTagList([...tagList, t]);
    setTagInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("נא להזין סכום תקין");
      return;
    }
    if (!title.trim()) {
      toast.error("נא להזין שם פעולה");
      return;
    }
    setDefaultPerson(enteredBy);
    const input: TransactionInput = {
      type,
      amount: amt,
      currency,
      fx_rate_to_ils: parseFloat(fx) || 1,
      category_id: categoryId,
      title: title.trim(),
      note: note.trim() || null,
      occurred_at: date,
      entered_by: enteredBy,
      tag_names: tagList,
      investment_account_id: type === "investment" ? accountId : null,
      payment_method: paymentMethod,
    };
    setSubmitting(true);
    try {
      if (existing) {
        await updateTransaction(existing.id, input);
        toast.success("התנועה עודכנה");
        navigate({ to: "/transactions/$id", params: { id: existing.id } });
      } else {
        await createTransaction(input);
        toast.success("התנועה נוספה");
        navigate({ to: "/" });
      }
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בשמירה");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm("למחוק את התנועה?")) return;
    try {
      await deleteTransaction(existing.id);
      toast.success("נמחק");
      navigate({ to: "/transactions" });
    } catch {
      toast.error("שגיאה במחיקה");
    }
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="px-5 md:px-0 pt-6 pb-8 space-y-5 max-w-2xl mx-auto">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{existing ? "עריכת תנועה" : "תנועה חדשה"}</h1>
          <button
            type="button"
            onClick={() =>
              existing
                ? navigate({ to: "/transactions/$id", params: { id: existing.id } })
                : navigate({ to: "/" })
            }
            className="text-sm text-muted-foreground"
          >
            ביטול
          </button>
        </header>

        <div>
          <Label>מי הזין?</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(["yonatan", "shiri"] as Person[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setEnteredBy(p)}
                className={cn(
                  "h-12 rounded-xl border text-base font-semibold transition",
                  enteredBy === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border",
                )}
              >
                {personLabel[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>סוג פעולה</Label>
          <div className="mt-2 flex gap-2 overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0 pb-1">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  setCategoryId(null);
                  if (t !== "investment") setAccountId(null);
                }}
                className={cn(
                  "px-4 h-10 rounded-full text-sm whitespace-nowrap border transition",
                  type === t
                    ? typeButtonActiveClass(t)
                    : "bg-card border-border text-foreground",
                )}
              >
                {txTypeLabel[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>סכום</Label>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              autoFocus={!existing}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="flex-1 h-14 rounded-xl bg-card border px-4 text-2xl font-bold tabular-nums outline-none focus:ring-2 focus:ring-primary/30 text-left"
              dir="ltr"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-14 rounded-xl bg-card border px-3 text-base font-semibold"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {currency !== "ILS" && (
            <div className="mt-2">
              <Label>שער ל־ש"ח</Label>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={fx}
                onChange={(e) => setFx(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl bg-card border px-4 outline-none focus:ring-2 focus:ring-primary/30"
                dir="ltr"
              />
            </div>
          )}
        </div>

        <div>
          <Label>שם הפעולה</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: סופר רמי לוי"
            className="mt-2 w-full h-12 rounded-xl bg-card border px-4 outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <Label>קטגוריה</Label>
          <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2">
            {filteredCats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "h-16 rounded-xl border text-xs font-medium transition flex flex-col items-center justify-center gap-1 px-1",
                  categoryId === c.id
                    ? "border-2 border-primary"
                    : "border-border bg-card",
                )}
                style={
                  categoryId === c.id ? { background: c.color + "22" } : undefined
                }
              >
                <span
                  className="size-3 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="truncate w-full text-center">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {type === "investment" && (
          <div>
            <Label>חשבון השקעה</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "h-14 rounded-xl border text-xs font-semibold transition flex items-center justify-center gap-2 px-2",
                    accountId === a.id
                      ? "border-2 border-primary"
                      : "border-border bg-card",
                  )}
                  style={
                    accountId === a.id ? { background: a.color + "22" } : undefined
                  }
                >
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>תאריך</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full h-12 rounded-xl bg-card border px-4 outline-none focus:ring-2 focus:ring-primary/30"
            dir="ltr"
          />
        </div>

        <div>
          <Label>תגיות</Label>
          <div className="mt-2 flex flex-wrap gap-1.5 mb-2">
            {tagList.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTagList(tagList.filter((x) => x !== t))}
                className="px-3 h-7 rounded-full bg-accent text-accent-foreground text-xs"
              >
                {t} ×
              </button>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="הוסף תגית ולחץ Enter"
            className="w-full h-11 rounded-xl bg-card border px-4 outline-none focus:ring-2 focus:ring-primary/30"
          />
          {tagSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTag(s)}
                  className="px-3 h-7 rounded-full border border-border bg-card text-xs"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>הערה (לא חובה)</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-xl bg-card border px-4 py-3 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 h-14 rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/20 disabled:opacity-60"
          >
            {submitting ? "שומר…" : existing ? "עדכן" : "שמור"}
          </button>
          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              className="h-14 px-5 rounded-2xl bg-destructive/10 text-destructive font-semibold"
            >
              מחק
            </button>
          )}
        </div>
      </form>
    </AppShell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-semibold text-foreground">{children}</label>;
}

function typeButtonActiveClass(t: TxType) {
  switch (t) {
    case "income":
      return "bg-income text-income-foreground border-income";
    case "expense":
      return "bg-expense text-expense-foreground border-expense";
    case "fixed":
      return "bg-fixed text-fixed-foreground border-fixed";
    case "savings":
    case "investment":
      return "bg-savings text-savings-foreground border-savings";
  }
}
