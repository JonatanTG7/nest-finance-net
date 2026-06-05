import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X, MapPin, Camera, Calendar as CalIcon, Pencil, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchInvestmentAccounts,
  fetchTags,
  updateTransaction,
  uploadTransactionPhoto,
  type Category,
  type Transaction,
  type TransactionInput,
} from "@/lib/db";
import { txTypeLabel } from "@/lib/finance";
import { getDefaultPerson, setDefaultPerson, useMemberLabels, type Person } from "@/lib/person";
import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/finance";
import type { PaymentMethod } from "@/lib/db";

const TYPES: TxType[] = ["expense", "income", "fixed", "savings", "investment"];
const CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
const PAYMENT_METHODS: { value: PaymentMethod; label: string; emoji: string }[] = [
  { value: "cash", label: "מזומן", emoji: "💵" },
  { value: "credit", label: "אשראי", emoji: "💳" },
  { value: "standing_order", label: "הוראת קבע", emoji: "🔁" },
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
  const [showNote, setShowNote] = useState(!!existing?.note);
  const [date, setDate] = useState(existing?.occurred_at ?? new Date().toISOString().slice(0, 10));
  const [enteredBy, setEnteredBy] = useState<Person>(existing?.entered_by ?? getDefaultPerson());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    existing?.payment_method ?? "credit",
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [location, setLocation] = useState<string | null>(existing?.location ?? null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagList, setTagList] = useState<string[]>(
    existing?.transaction_tags?.map((tt) => tt.tag.name) ?? [],
  );
  const [showTags, setShowTags] = useState((existing?.transaction_tags?.length ?? 0) > 0);
  const [submitting, setSubmitting] = useState(false);

  // Two-step flow: pick category, then details. Edit mode skips step 1.
  const [step, setStep] = useState<1 | 2>(existing ? 2 : 1);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  const selectedCat = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // Auto-link investment category → account
  useEffect(() => {
    if (type !== "investment" || !categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.investment_account_id) setAccountId(cat.investment_account_id);
  }, [type, categoryId, categories]);

  function chooseCategory(c: Category) {
    setCategoryId(c.id);
    setStep(2);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadTransactionPhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בהעלאת תמונה");
    } finally {
      setUploading(false);
    }
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      toast.error("המכשיר לא תומך באיתור מיקום");
      return;
    }
    setLoadingLoc(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=he`,
          );
          const j = await r.json();
          const addr = j.display_name as string | undefined;
          setLocation(addr ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } catch {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setLoadingLoc(false);
        }
      },
      () => {
        toast.error("לא ניתן לאתר מיקום");
        setLoadingLoc(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function addTag(name: string) {
    const t = name.trim();
    if (!t || tagList.includes(t)) return;
    setTagList([...tagList, t]);
    setTagInput("");
  }

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return tags
      .map((t) => t.name)
      .filter((n) => n.toLowerCase().includes(q) && !tagList.includes(n))
      .slice(0, 4);
  }, [tagInput, tags, tagList]);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("נא להזין סכום תקין");
      return;
    }
    if (!categoryId) {
      toast.error("בחר קטגוריה");
      setStep(1);
      return;
    }
    setDefaultPerson(enteredBy);
    const input: TransactionInput = {
      type,
      amount: amt,
      currency,
      fx_rate_to_ils: parseFloat(fx) || 1,
      category_id: categoryId,
      title: title.trim() || (selectedCat?.name ?? ""),
      note: note.trim() || null,
      occurred_at: date,
      entered_by: enteredBy,
      tag_names: tagList,
      investment_account_id: type === "investment" ? accountId : null,
      payment_method: paymentMethod,
      photo_url: photoUrl,
      location,
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

  function cancel() {
    if (existing) navigate({ to: "/transactions/$id", params: { id: existing.id } });
    else if (step === 2 && !existing) setStep(1);
    else navigate({ to: "/" });
  }

  // ===================== STEP 1: pick category =====================
  if (step === 1) {
    return (
      <AppShell>
        <div className="px-5 md:px-0 pt-5 pb-8 max-w-3xl mx-auto">
          <header className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="size-10 rounded-full bg-card border flex items-center justify-center"
              aria-label="ביטול"
            >
              <X className="size-5" />
            </button>
            <h1 className="text-xl font-bold">בחר קטגוריה</h1>
            <div className="w-10" />
          </header>

          <div className="flex gap-2 overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0 pb-3">
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
                  "px-4 h-10 rounded-full text-sm whitespace-nowrap border transition shrink-0",
                  type === t
                    ? typeButtonActiveClass(t)
                    : "bg-card border-border text-foreground",
                )}
              >
                {txTypeLabel[t]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {filteredCats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => chooseCategory(c)}
                className="aspect-square rounded-2xl bg-card border border-border flex flex-col items-center justify-center gap-2 p-2 active:scale-95 transition"
                style={{ borderColor: c.color + "33" }}
              >
                <span
                  className="size-14 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: c.color + "22" }}
                >
                  {c.emoji ?? "•"}
                </span>
                <span className="text-xs font-semibold text-center leading-tight">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // ===================== STEP 2: details =====================
  const headerBg = selectedCat?.color ?? "#10b981";
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto pb-6">
        {/* Sticky colored header */}
        <div
          className="relative px-5 pt-5 pb-6 md:rounded-b-3xl"
          style={{
            background: `linear-gradient(180deg, ${headerBg}22 0%, ${headerBg}08 100%)`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={cancel}
              className="size-11 rounded-full bg-card/80 backdrop-blur border flex items-center justify-center"
              aria-label="ביטול"
            >
              <X className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="size-11 rounded-full text-white flex items-center justify-center shadow-lg disabled:opacity-60"
              style={{ background: headerBg }}
              aria-label="שמור"
            >
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => !existing && setStep(1)}
              className="size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
              style={{ background: headerBg }}
              aria-label="שנה קטגוריה"
            >
              {selectedCat?.emoji ?? "•"}
            </button>

            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              autoFocus={!existing}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-4xl font-extrabold tabular-nums outline-none text-center"
              style={{ color: headerBg }}
              dir="ltr"
            />

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-11 rounded-xl text-white px-2 text-sm font-bold shrink-0"
              style={{ background: headerBg }}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <p className="mt-1 text-xs text-center text-muted-foreground">
            {selectedCat?.name} · {txTypeLabel[type]}
          </p>
        </div>

        {/* Compact details */}
        <div className="px-5 mt-4 space-y-3">
          {/* Title + note */}
          <div className="rounded-2xl bg-card border px-3 h-12 flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground shrink-0" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              className="text-xs text-muted-foreground px-2 py-1 rounded-md hover:bg-accent"
            >
              + הערה
            </button>
          </div>
          {showNote && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="הערה"
              className="w-full rounded-2xl bg-card border px-4 py-2 outline-none text-sm resize-none"
            />
          )}

          {/* Date + person */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card border px-3 h-12 flex items-center gap-2">
              <CalIcon className="size-4 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 rounded-2xl bg-card border h-12 overflow-hidden">
              {(["yonatan", "shiri"] as Person[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEnteredBy(p)}
                  className={cn(
                    "text-sm font-semibold transition",
                    enteredBy === p ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {memberLabels[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setPaymentMethod(paymentMethod === m.value ? null : m.value)}
                className={cn(
                  "h-12 rounded-2xl border text-sm font-semibold transition flex items-center justify-center gap-1.5",
                  paymentMethod === m.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border",
                )}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Photo + location */}
          <div className="grid grid-cols-2 gap-2">
            <label
              className={cn(
                "h-12 rounded-2xl bg-card border flex items-center justify-center gap-2 text-sm font-medium cursor-pointer",
                photoUrl && "border-primary",
              )}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              <span>{photoUrl ? "תמונה ✓" : "תמונה"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </label>
            <button
              type="button"
              onClick={detectLocation}
              className={cn(
                "h-12 rounded-2xl bg-card border flex items-center justify-center gap-2 text-sm font-medium px-2 overflow-hidden",
                location && "border-primary",
              )}
            >
              {loadingLoc ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MapPin className="size-4 shrink-0" />
              )}
              <span className="truncate">
                {location ? location.split(",")[0] : "מיקום"}
              </span>
            </button>
          </div>

          {photoUrl && (
            <div className="relative">
              <img
                src={photoUrl}
                alt="צילום הקבלה"
                className="w-full max-h-40 object-cover rounded-2xl border"
              />
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Investment account */}
          {type === "investment" && (
            <div className="grid grid-cols-3 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "h-11 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5",
                    accountId === a.id ? "border-2 border-primary" : "border-border bg-card",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: a.color }} />
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tags toggle */}
          {!showTags ? (
            <button
              type="button"
              onClick={() => setShowTags(true)}
              className="text-xs text-muted-foreground"
            >
              + הוסף תגיות
            </button>
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
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
                placeholder="תגית + Enter"
                className="w-full h-10 rounded-xl bg-card border px-3 outline-none text-sm"
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
          )}

          {currency !== "ILS" && (
            <div className="rounded-2xl bg-card border px-3 h-12 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">שער ל-ש"ח</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={fx}
                onChange={(e) => setFx(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                dir="ltr"
              />
            </div>
          )}

          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full h-11 rounded-2xl bg-destructive/10 text-destructive font-semibold text-sm"
            >
              מחק תנועה
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
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
