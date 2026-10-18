import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchCategories, fetchTransactionsBetween } from "@/lib/db";
import { fetchBudgets, saveBudget } from "@/lib/budgets";
import { budgetProgress, categorySpent } from "@/lib/finance-rules";
import { formatILS, monthRangeFromKey } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function CategoryBudgets({ month }: { month: string }) {
  const qc = useQueryClient();
  const budgets = useQuery({ queryKey: ["category_budgets"], queryFn: fetchBudgets });
  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { start, end } = monthRangeFromKey(month);
  const txs = useQuery({ queryKey: ["transactions", "budgets", start, end], queryFn: () => fetchTransactionsBetween(start, end) });
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = (categories.data ?? []).filter((c) => c.type === "expense" || c.type === "fixed");
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await saveBudget(category, Number(amount)); await qc.invalidateQueries({ queryKey: ["category_budgets"] }); setOpen(false); toast.success("התקציב נשמר"); }
    catch { toast.error("לא הצלחנו לשמור את התקציב"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("להסיר את התקציב? התנועות יישארו.")) return;
    try { await saveBudget(id, null); await qc.invalidateQueries({ queryKey: ["category_budgets"] }); }
    catch { toast.error("לא הצלחנו להסיר את התקציב"); }
  }
  return <section className="px-5 md:px-0 mt-6">
    <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-base font-semibold">תקציבים חודשיים · {Number(month.slice(5))}/{month.slice(0, 4)}</h2><Button variant="ghost" size="sm" onClick={() => { setCategory(""); setAmount(""); setOpen(true); }}><Plus className="size-4" />תקציב</Button></div>
    {budgets.isError || txs.isError || categories.isError ? <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון את התקציבים</p> : budgets.isPending || txs.isPending ? <p className="text-sm text-muted-foreground">טוען…</p> : !budgets.data?.length ? <p className="text-sm text-muted-foreground">לא הוגדרו תקציבים חודשיים</p> : <div className="grid md:grid-cols-2 gap-3">{budgets.data.map((b) => {
      const c = categories.data?.find((c) => c.id === b.category_id);
      const spent = categorySpent(txs.data ?? [], b.category_id, todayISO());
      const p = budgetProgress(spent, Number(b.amount_ils));
      return <div key={b.category_id} className="border rounded-lg bg-card p-4 space-y-2">
        <div className="flex items-center gap-2"><span className="flex-1 text-sm font-semibold truncate">{c?.emoji} {c?.name ?? "קטגוריה"}</span><Button variant="ghost" size="icon" aria-label={`עריכת תקציב ${c?.name ?? ""}`} title="עריכת תקציב" onClick={() => { setCategory(b.category_id); setAmount(String(b.amount_ils)); setOpen(true); }}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`הסרת תקציב ${c?.name ?? ""}`} title="הסרת תקציב" onClick={() => remove(b.category_id)}><Trash2 className="size-4" /></Button></div>
        <div className="flex justify-between gap-2 flex-wrap text-xs tabular-nums"><span>{formatILS(spent)} מתוך {formatILS(Number(b.amount_ils))}</span><span className={cn(p.state === "over" ? "text-destructive" : p.state === "near" ? "text-fixed" : "text-income")}>{p.state === "over" ? `חריגה: ${formatILS(-p.remaining)}` : p.state === "near" ? `מתקרבים לתקציב · ${p.percent}%` : `נותרו ${formatILS(p.remaining)}`}</span></div>
        <progress aria-label={`ניצול תקציב ${c?.name ?? ""}`} value={Math.min(p.percent, 100)} max="100" className={cn("w-full h-2", p.state === "over" ? "accent-destructive" : p.state === "near" ? "accent-fixed" : "accent-income")} />
      </div>;
    })}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>תקציב חודשי</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
      <label className="block text-sm">קטגוריה<select aria-label="קטגוריה לתקציב" className="w-full border rounded-md h-10 bg-background px-3" required value={category} onChange={(e) => setCategory(e.target.value)}><option value="">בחר קטגוריה</option>{eligible.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></label>
      <label className="block text-sm">תקציב חודשי (₪)<Input aria-label="תקציב חודשי (₪)" type="number" min="0.01" step="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "שומר…" : "שמור תקציב"}</Button>
    </form></DialogContent></Dialog>
  </section>;
}