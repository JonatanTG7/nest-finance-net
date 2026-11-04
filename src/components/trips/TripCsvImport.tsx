import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, ArrowRight, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { parseExpenseCsv } from "@/lib/csv-import";
import { draftError, tripCsvDrafts, type TripCsvDraft } from "@/lib/trip-csv-review";
import { createTransaction, fetchCategories } from "@/lib/db";
import { fetchRateToIls } from "@/lib/fx";
import { useMemberLabels, type Person } from "@/lib/person";
import { usePaymentMethods } from "@/lib/payment_methods";
import { useCreditCards } from "@/lib/credit_cards";

export function TripCsvImport({ tripId, tripCurrency }: { tripId: string; tripCurrency: string }) {
  const qc = useQueryClient();
  const labels = useMemberLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const rates = useRef(new Map<string, number>());
  const [rows, setRows] = useState<TripCsvDraft[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: paymentMethods = [] } = usePaymentMethods();
  const expenseCats = categories.filter((c) => c.type === "expense");
  const chosen = rows?.filter((r) => r.on) ?? [];
  const current = chosen[index];
  // Old trips: credit imports never require picking a specific card.
  const needsCard = false;

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const parsed = parseExpenseCsv(await f.text());
      if (!parsed.length) { toast.error("לא נמצאו שורות עם תאריך וסכום בקובץ"); return; }
      // Trips are always shared between the partners.
      setRows(tripCsvDrafts(parsed, tripCurrency, "shared", expenseCats));
      setReviewing(false); setIndex(0); setSaved(0); setError(null); rates.current.clear();
    } catch { toast.error("לא ניתן לקרוא את הקובץ"); }
  }

  function update(patch: Partial<TripCsvDraft>) {
    if (!current || saving) return;
    setRows((rs) => rs?.map((r) => r.id === current.id ? { ...r, ...patch } : r) ?? null);
    setError(null);
  }

  async function saveCurrent() {
    if (!current || busy.current) return;
    const validation = draftError(current) ?? (needsCard && cards.length > 0 && !current.creditCardId ? "בחר כרטיס אשראי" : null);
    if (validation) { setError(validation); return; }
    busy.current = true; setSaving(true); setError(null);
    try {
      const rate = rates.current.get(current.currency) ?? await fetchRateToIls(current.currency);
      rates.current.set(current.currency, rate);
      await createTransaction({
        type: "expense", amount: Number(current.amount), currency: current.currency,
        fx_rate_to_ils: rate, category_id: current.categoryId, title: current.title.trim(),
        note: ["יובא מ-CSV", current.note.trim()].filter(Boolean).join("\n"),
        occurred_at: current.date, entered_by: current.person, tag_names: [], trip_id: tripId,
        payment_method: current.paymentMethod, credit_card_id: needsCard ? current.creditCardId || null : null,
        location: current.location.trim() || null,
      });
      // Remove committed rows immediately: retry and backwards navigation cannot import them again.
      setRows((rs) => rs?.filter((r) => r.id !== current.id) ?? null);
      setSaved((n) => n + 1);
      setIndex(Math.min(index, chosen.length - 2));
      void qc.invalidateQueries({ queryKey: ["trip", tripId] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      if (chosen.length === 1) {
        toast.success(`נוספו ${saved + 1} הוצאות לטיול`);
        setRows(null); setReviewing(false); setIndex(0);
      }
    } catch {
      setError("התנועה לא נשמרה. הפרטים נשארו כאן — אפשר לנסות שוב.");
    } finally { busy.current = false; setSaving(false); }
  }

  const selectClass = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm";
  return <>
    <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> ייבוא מ-CSV</Button>
    <Dialog open={rows !== null} onOpenChange={(open) => { if (!open && !busy.current) setRows(null); }}>
      <DialogContent className="max-h-[90dvh] flex flex-col overflow-hidden" dir="rtl" onInteractOutside={(e) => { if (saving) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{reviewing ? "השלמת תנועה מהייבוא" : "ייבוא הוצאות לטיול"}</DialogTitle></DialogHeader>
        {!reviewing ? <>
          <div className="min-h-0 overflow-y-auto rounded-lg border divide-y">
            {rows?.map((r) => <label key={r.id} className="flex items-center gap-3 px-3 py-3 text-sm">
              <Checkbox checked={r.on} onCheckedChange={(v) => setRows((rs) => rs?.map((x) => x.id === r.id ? { ...x, on: v === true } : x) ?? null)} />
              <div className="flex-1 min-w-0"><p className="truncate">{r.title}</p><p className="text-xs text-muted-foreground">{r.date}</p></div>
              <span className="tabular-nums shrink-0" dir="ltr">{Number(r.amount).toLocaleString()} {r.currency}</span>
            </label>)}
          </div>
          <Button disabled={!chosen.length} onClick={() => { setIndex(0); setReviewing(true); }}>השלמת {chosen.length} תנועות</Button>
        </> : current ? <>
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>תנועה {index + 1} מתוך {chosen.length} שנותרו</span><span>{saved} נשמרו</span>
          </div>
          <fieldset disabled={saving} className="min-h-0 overflow-y-auto space-y-4 px-1 pb-2">
            <label className="block space-y-1 text-sm"><span>שם התנועה</span><Input value={current.title} onChange={(e) => update({ title: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm"><span>תאריך</span><Input type="date" value={current.date} onChange={(e) => update({ date: e.target.value })} className="min-w-0" /></label>
              <label className="block space-y-1 text-sm"><span>סכום</span><Input type="number" min="0" step="0.01" inputMode="decimal" dir="ltr" value={current.amount} onChange={(e) => update({ amount: e.target.value })} /></label>
            </div>
            <label className="block space-y-1 text-sm"><span>מטבע</span><Input value={current.currency} maxLength={3} dir="ltr" onChange={(e) => update({ currency: e.target.value.toUpperCase() })} /></label>
            <label className="block space-y-1 text-sm"><span>קטגוריה</span><select className={selectClass} value={current.categoryId} onChange={(e) => update({ categoryId: e.target.value })}><option value="">בחר קטגוריה</option>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ?? ""} {c.name}</option>)}</select></label>
            <div className="space-y-1 text-sm"><span>מי שילם</span><div className="flex gap-2">{(["yonatan", "shiri", "shared"] as Person[]).map((p) => <Button key={p} variant={current.person === p ? "default" : "outline"} className="flex-1 min-w-0" aria-pressed={current.person === p} onClick={() => update({ person: p })}>{labels[p]}</Button>)}</div></div>
            <label className="block space-y-1 text-sm"><span>אמצעי תשלום</span><select className={selectClass} value={current.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value, creditCardId: "" })}><option value="">בחר אמצעי תשלום</option>{paymentMethods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
            <label className="block space-y-1 text-sm"><span>עיר / אזור</span><Input value={current.location} onChange={(e) => update({ location: e.target.value })} /></label>
            <label className="block space-y-1 text-sm"><span>הערה</span><Input value={current.note} onChange={(e) => update({ note: e.target.value })} /></label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="icon" aria-label="התנועה הקודמת" disabled={saving || index === 0} onClick={() => { setIndex((i) => i - 1); setError(null); }}><ArrowRight className="size-4" /></Button>
            <Button className="flex-1" disabled={saving} onClick={() => void saveCurrent()}>{saving ? "שומר…" : chosen.length === 1 ? "שמור וסיים" : "שמור והמשך לתנועה הבאה"}</Button>
            <Button variant="outline" size="icon" aria-label="התנועה הבאה" disabled={saving || index >= chosen.length - 1} onClick={() => { setIndex((i) => i + 1); setError(null); }}><ArrowLeft className="size-4" /></Button>
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
  </>;
}
