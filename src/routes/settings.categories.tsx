import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, GitMerge, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
import {
  deleteCategory,
  fetchCategoriesForManagement,
  fetchUncategorizedTransactions,
  mergeCategories,
  unhideCategoryForHousehold,
  type CategoryWithHidden,
} from "@/lib/db";
import { formatILS, txTypeLabel, type TxType } from "@/lib/finance";

export const Route = createFileRoute("/settings/categories")({
  head: () => ({ meta: [{ title: "ניהול קטגוריות" }] }),
  component: CategoriesManager,
});

const TYPE_ORDER: TxType[] = ["income", "expense", "fixed", "savings", "investment"];

function CategoriesManager() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", "management"],
    queryFn: fetchCategoriesForManagement,
  });
  const { data: uncategorized = [] } = useQuery({
    queryKey: ["transactions", "uncategorized"],
    queryFn: fetchUncategorizedTransactions,
  });

  const [deleteTarget, setDeleteTarget] = useState<CategoryWithHidden | null>(null);
  const [mergeTarget, setMergeTarget] = useState<CategoryWithHidden | null>(null);
  const [mergeInto, setMergeInto] = useState<string>("");

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  const unhideMutation = useMutation({
    mutationFn: unhideCategoryForHousehold,
    onSuccess: () => {
      invalidateAll();
      toast.success("הקטגוריה תוצג שוב");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidateAll();
      toast.success("הקטגוריה נמחקה");
      setDeleteTarget(null);
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה במחיקה");
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) => mergeCategories(source, target),
    onSuccess: () => {
      invalidateAll();
      toast.success("הקטגוריות אוחדו");
      setMergeTarget(null);
      setMergeInto("");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה באיחוד");
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<TxType, CategoryWithHidden[]>();
    for (const c of categories) {
      const arr = m.get(c.type as TxType) ?? [];
      arr.push(c);
      m.set(c.type as TxType, arr);
    }
    return m;
  }, [categories]);

  const mergeOptions = mergeTarget
    ? categories.filter((c) => c.type === mergeTarget.type && c.id !== mergeTarget.id && !c.hidden)
    : [];

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/settings" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">ניהול קטגוריות</h1>
          <p className="text-xs text-muted-foreground">איחוד או מחיקה של קטגוריה</p>
        </div>
      </header>

      {uncategorized.length > 0 && (
        <div className="px-5 md:px-0 mb-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {uncategorized.length} תנועות בלי קטגוריה בכלל
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  זה קורה כשקטגוריה נמחקת מחוץ לאפליקציה (למשל ב-SQL ישיר) — התנועות שהיו בה נשארות
                  "יתומות". תקנו כל אחת בנפרד כדי שהסוג יתאים נכון.
                </p>
                <div className="mt-2 space-y-1.5">
                  {uncategorized.slice(0, 5).map((t) => (
                    <Link
                      key={t.id}
                      to="/transactions/edit/$id"
                      params={{ id: t.id }}
                      className="flex items-center justify-between rounded-xl bg-background/60 px-3 py-2 text-xs"
                    >
                      <span className="truncate">
                        {t.title} · {txTypeLabel[t.type]}
                      </span>
                      <span className="tabular-nums font-medium shrink-0 ms-2">
                        {formatILS(Number(t.amount_ils))}
                      </span>
                    </Link>
                  ))}
                </div>
                {uncategorized.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    ועוד {uncategorized.length - 5} נוספות — הן יופיעו בתור "ללא קטגוריה" ברשימה
                    הראשית עד שיסווגו.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 md:px-0 pb-8 space-y-6">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
        ) : (
          TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => (
            <div key={type}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">{txTypeLabel[type]}</h2>
              <ul className="rounded-2xl bg-card border divide-y">
                {grouped.get(type)!.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 p-4">
                    <span
                      className="size-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: c.color + "22" }}
                    >
                      {c.emoji ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium truncate">{c.name}</p>
                        {c.hidden && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                            מוסתרת
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.txCount} תנועות</p>
                    </div>

                    {c.hidden ? (
                      <button onClick={() => unhideMutation.mutate(c.id)} className="text-xs text-primary shrink-0">
                        בטל הסתרה
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setMergeTarget(c);
                            setMergeInto("");
                          }}
                          title="איחוד עם קטגוריה אחרת"
                          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                        >
                          <GitMerge className="size-4" />
                        </button>
                        {!c.is_system && (
                          <button
                            onClick={() => setDeleteTarget(c)}
                            title="מחיקה"
                            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Merge: pick another category of the same type to fold this one into */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(v) => !v && setMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>איחוד "{mergeTarget?.name}"</AlertDialogTitle>
            <AlertDialogDescription>
              כל התנועות של "{mergeTarget?.name}" יעברו לקטגוריה שתבחר/י, ו"{mergeTarget?.name}"{" "}
              {mergeTarget?.is_system ? "תוסתר" : "תימחק"}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {mergeOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קטגוריה אחרת מאותו סוג לאחד איתה.</p>
          ) : (
            <select
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              className="w-full h-12 rounded-xl bg-background border px-3 text-base outline-none"
            >
              <option value="" disabled>
                בחר/י קטגוריה…
              </option>
              {mergeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.emoji} {o.name}
                </option>
              ))}
            </select>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={!mergeInto || mergeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (mergeTarget && mergeInto) {
                  mergeMutation.mutate({ source: mergeTarget.id, target: mergeInto });
                }
              }}
            >
              איחוד
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: only for categories this household created */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.txCount > 0
                ? `${deleteTarget.txCount} תנועות ישויכו אוטומטית לקטגוריית "אחר".`
                : "הקטגוריה תימחק לצמיתות."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
