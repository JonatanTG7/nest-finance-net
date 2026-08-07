import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X, MapPin, Camera, Calendar as CalIcon, Pencil, Loader2, Plus, RefreshCw, ChevronDown, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppShell } from "@/components/AppShell";
import { CategoryDialog } from "@/components/CategoryDialog";

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
import {
  createPaymentMethod,
  getLastPaymentMethod,
  setLastPaymentMethod,
  useInvalidatePaymentMethods,
  usePaymentMethods,
} from "@/lib/payment_methods";
import { fetchRateToIls } from "@/lib/fx";
import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/finance";

const TYPES: TxType[] = ["expense", "income", "fixed", "investment"];
const CURRENCIES = ["ILS", "USD", "EUR"] as const;

export function TransactionForm({
  existing,
  onDone,
}: {
  existing?: Transaction;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const memberLabels = useMemberLabels();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const { data: paymentMethods = [] } = usePaymentMethods();
  const invalidatePm = useInvalidatePaymentMethods();

  const [type, setType] = useState<TxType>(existing?.type ?? "expense");
  const [showNewCat, setShowNewCat] = useState(false);
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
  const [paymentMethod, setPaymentMethod] = useState<string | null>(
    existing?.payment_method ?? getLastPaymentMethod() ?? "credit",
  );
  const [pmSheetOpen, setPmSheetOpen] = useState(false);
  const [pmDraft, setPmDraft] = useState("");
  const [savingPm, setSavingPm] = useState(false);
  const [installments, setInstallments] = useState<number>(1);
  const [repeatMode, setRepeatMode] = useState<"single" | "installments" | "recurring">("single");
  const [recurringUntil, setRecurringUntil] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [fetchingFx, setFetchingFx] = useState(false);
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

  const [step, setStep] = useState<1 | 2>(existing ? 2 : 1);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  const selectedCat = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  // Auto-link investment category → account
  useEffect(() => {
    if (type !== "investment" || !categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.investment_account_id) setAccountId(cat.investment_account_id);
  }, [type, categoryId, categories]);

  // When investment account uses a non-ILS currency (e.g. Interactive Brokers USD), switch currency.
  useEffect(() => {
    if (!selectedAccount) return;
    if (selectedAccount.currency === "ILS") return;
    setCurrency(selectedAccount.currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  const [fxError, setFxError] = useState<string | null>(null);

  // Auto-fetch live rate whenever currency changes to a non-ILS currency.
  useEffect(() => {
    if (currency === "ILS") {
      setFx("1");
      setFxError(null);
      return;
    }
    let cancelled = false;
    setFetchingFx(true);
    setFxError(null);
    fetchRateToIls(currency)
      .then((r) => {
        if (!cancelled) setFx(r.toFixed(4));
      })
      .catch((e) => {
        if (!cancelled) setFxError(e?.message ?? "שגיאה בשליפת שער");
      })
      .finally(() => {
        if (!cancelled) setFetchingFx(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

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

  async function savePmDraft() {
    const label = pmDraft.trim();
    if (!label) return;
    setSavingPm(true);
    try {
      const row = await createPaymentMethod(label);
      invalidatePm();
      setPaymentMethod(row.key);
      setPmDraft("");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה ביצירת אמצעי תשלום");
    } finally {
      setSavingPm(false);
    }
  }

  const selectedPm = paymentMethods.find((m) => m.key === paymentMethod) ?? null;

  function shiftMonthIso(iso: string, months: number) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  // How many monthly occurrences from `date` through the chosen end month (inclusive).
  const recurringMonths = useMemo(() => {
    const [ey, em] = recurringUntil.split("-").map(Number);
    if (!ey || !em) return 1;
    const sy = Number(date.slice(0, 4));
    const sm = Number(date.slice(5, 7));
    const diff = (ey - sy) * 12 + (em - sm) + 1;
    return Math.max(1, Math.min(120, diff));
  }, [recurringUntil, date]);


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
    if (paymentMethod) setLastPaymentMethod(paymentMethod);

    const baseInput: TransactionInput = {
      type,
      amount: amt,
      currency,
      fx_rate_to_ils: parseFloat(fx) || 1,
      category_id: categoryId,
      title: title.trim() || (selectedCat?.name ?? ""),
      note: note.trim() || null,
      occurred_at: date,
      entered_by: type === "income" && enteredBy === "shared" ? "yonatan" : enteredBy,
      tag_names: tagList,
      investment_account_id: type === "investment" ? accountId : null,
      payment_method: type === "income" ? null : paymentMethod,
      photo_url: photoUrl,
      location,
    };

    const repeatable = type === "expense" || type === "fixed";
    const canSplit = repeatable && repeatMode === "installments" && installments > 1;
    const canRecur = repeatable && repeatMode === "recurring" && recurringMonths > 1;

    setSubmitting(true);
    try {
      if (existing) {
        await updateTransaction(existing.id, baseInput);
        toast.success("התנועה עודכנה");
        navigate({ to: "/transactions/$id", params: { id: existing.id } });
      } else if (canSplit) {
        // Split evenly to 2 decimals; give the rounding remainder to the first payment
        // so the sum of installments equals the original total exactly.
        const totalCents = Math.round(amt * 100);
        const baseCents = Math.floor(totalCents / installments);
        const remainderCents = totalCents - baseCents * installments;
        const baseTitle = baseInput.title;
        for (let i = 0; i < installments; i++) {
          const cents = baseCents + (i === 0 ? remainderCents : 0);
          const inp: TransactionInput = {
            ...baseInput,
            amount: cents / 100,
            occurred_at: shiftMonthIso(date, i),
            title: `${baseTitle} (${i + 1}/${installments})`,
          };
          await createTransaction(inp);
        }
        toast.success(`נוספו ${installments} תשלומים`);
        navigate({ to: "/" });
      } else if (canRecur) {
        // Full amount, same day of month, every month until the chosen end month.
        for (let i = 0; i < recurringMonths; i++) {
          await createTransaction({ ...baseInput, occurred_at: shiftMonthIso(date, i) });
        }
        toast.success(`נוספה הוצאה קבועה ל-${recurringMonths} חודשים`);
        navigate({ to: "/" });
      } else {
        await createTransaction(baseInput);
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

          <div className="grid grid-cols-3 gap-3">
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
            <button
              type="button"
              onClick={() => setShowNewCat(true)}
              className="aspect-square rounded-2xl bg-card border border-dashed border-border flex flex-col items-center justify-center gap-2 p-2 active:scale-95 transition"
            >
              <span className="size-14 rounded-2xl flex items-center justify-center bg-accent">
                <Plus className="size-6" />
              </span>
              <span className="text-xs font-semibold text-center leading-tight text-muted-foreground">
                קטגוריה חדשה
              </span>
            </button>
          </div>

          {showNewCat && (
            <CategoryDialog
              type={type}
              onClose={() => setShowNewCat(false)}
              onCreated={(c) => {
                setShowNewCat(false);
                qc.invalidateQueries({ queryKey: ["categories"] });
                chooseCategory(c);
              }}
            />
          )}
        </div>
      </AppShell>
    );
  }

  // ===================== STEP 2: details =====================
  const headerBg = selectedCat?.color ?? "#10b981";
  const isIncome = type === "income";
  const PAYERS: Person[] = isIncome
    ? ["yonatan", "shiri"]
    : ["yonatan", "shiri", "shared"];
  const activePayer: Person = isIncome && enteredBy === "shared" ? "yonatan" : enteredBy;
  const canShowInstallments = type === "expense" || type === "fixed";

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

          <div className="flex items-center gap-3">
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
              className="flex-1 min-w-0 bg-transparent text-4xl font-extrabold tabular-nums outline-none text-center"
              style={{ color: headerBg }}
              dir="ltr"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 h-10 px-3 rounded-xl text-sm font-bold flex items-center gap-1 text-white shadow-sm"
                  style={{ background: headerBg }}
                  aria-label="בחר מטבע"
                >
                  {currency}
                  <ChevronDown className="size-3.5 opacity-80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[8rem]">
                {CURRENCIES.map((c) => (
                  <DropdownMenuItem
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={cn("font-semibold justify-between", currency === c && "bg-accent")}
                  >
                    <span>{c}</span>
                    {currency === c && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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

          {/* Date */}
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

          {/* Payer / receiver */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">
              {isIncome ? "של מי ההכנסה" : "משלם / משלמת"}
            </p>
            <div
              className={cn(
                "grid rounded-2xl bg-card border h-12 overflow-hidden",
                PAYERS.length === 2 ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              {PAYERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEnteredBy(p)}
                  className={cn(
                    "text-sm font-semibold transition",
                    activePayer === p ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {memberLabels[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method — single button opens a sheet (not relevant for income) */}
          {!isIncome && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">אמצעי תשלום</p>
            <button
              type="button"
              onClick={() => setPmSheetOpen(true)}
              className="w-full h-12 rounded-2xl bg-card border px-4 text-sm font-semibold flex items-center justify-between"
            >
              <span className={selectedPm ? "text-foreground" : "text-muted-foreground"}>
                {selectedPm?.label ?? "בחר אמצעי תשלום"}
              </span>
              <span className="text-xs text-muted-foreground">החלף</span>
            </button>
          </div>
          )}


          {pmSheetOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
              onClick={() => setPmSheetOpen(false)}
            >
              <div
                className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border p-5 space-y-2 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold">אמצעי תשלום</h3>
                  <button
                    type="button"
                    onClick={() => setPmSheetOpen(false)}
                    className="size-9 rounded-full bg-background border flex items-center justify-center"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(m.key);
                        setPmSheetOpen(false);
                      }}
                      className={cn(
                        "h-12 px-3 rounded-2xl border text-sm font-semibold transition",
                        paymentMethod === m.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="pt-3 mt-2 border-t flex gap-2">
                  <input
                    value={pmDraft}
                    onChange={(e) => setPmDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void savePmDraft();
                      }
                    }}
                    placeholder="הוסף חדש (צ׳ק, ביט…)"
                    className="flex-1 h-11 rounded-2xl border bg-background px-3 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={savePmDraft}
                    disabled={savingPm || !pmDraft.trim()}
                    className="h-11 px-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1 disabled:opacity-60"
                  >
                    <Plus className="size-4" />
                    הוסף
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Repeat: single / installments / recurring fixed */}
          {canShowInstallments && !existing && (
            <div className="rounded-2xl bg-card border p-3">
              <p className="text-xs text-muted-foreground">תשלומים / חזרתיות</p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
                {(
                  [
                    ["single", "חד פעמי"],
                    ["installments", "מספר תשלומים"],
                    ["recurring", "הוצאה קבועה"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRepeatMode(key)}
                    className={cn(
                      "h-10 rounded-xl text-xs font-semibold transition-colors",
                      repeatMode === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {repeatMode === "installments" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={36}
                    value={installments}
                    onChange={(e) =>
                      setInstallments(Math.max(1, Math.min(36, Number(e.target.value) || 1)))
                    }
                    className="w-20 h-11 rounded-xl border bg-background px-3 text-base outline-none"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    {installments > 1 && amount
                      ? `${installments} × ${(parseFloat(amount) / installments).toFixed(2)} ${currency} — תנועות נפרדות לחודשים עוקבים`
                      : "פיצול הסכום לחודשים עוקבים"}
                  </p>
                </div>
              )}

              {repeatMode === "recurring" && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">עד חודש</span>
                    <input
                      type="month"
                      value={recurringUntil}
                      onChange={(e) => setRecurringUntil(e.target.value)}
                      className="h-11 flex-1 rounded-xl border bg-background px-3 text-base outline-none"
                      dir="ltr"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {amount
                      ? `${recurringMonths} חודשים × ${parseFloat(amount || "0").toFixed(2)} ${currency} — בכל ${Number(date.slice(8, 10))} בחודש`
                      : `יווצרו ${recurringMonths} תנועות, אחת בכל חודש באותו תאריך`}
                  </p>
                </div>
              )}
            </div>
          )}

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
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 px-2",
                    accountId === a.id ? "border-2 border-primary" : "border-border bg-card",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: a.color }} />
                  <span className="truncate">
                    {a.name}{" "}
                    <span className="text-xs text-muted-foreground">{a.currency}</span>
                  </span>
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
              <span className="text-xs text-muted-foreground">שער ל-ש״ח</span>
              <div className="flex-1 flex items-center gap-2" dir="ltr">
                {fetchingFx ? (
                  <>
                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">טוען שער חי…</span>
                  </>
                ) : fxError ? (
                  <span className="text-sm text-destructive">שגיאה בשליפת שער</span>
                ) : (
                  <span className="text-sm font-semibold tabular-nums">
                    1 {currency} = {parseFloat(fx || "0").toFixed(4)} ₪
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFetchingFx(true);
                  setFxError(null);
                  fetchRateToIls(currency)
                    .then((r) => setFx(r.toFixed(4)))
                    .catch((e) => setFxError(e?.message ?? "שגיאה"))
                    .finally(() => setFetchingFx(false));
                }}
                className="text-xs text-primary flex items-center gap-1"
                disabled={fetchingFx}
                aria-label="רענן שער"
              >
                <RefreshCw className={cn("size-3", fetchingFx && "animate-spin")} />
                Live
              </button>
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
