import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Plus, Pencil, Trash2, X } from "lucide-react";
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
  cardLabel,
  createCreditCard,
  deleteCreditCard,
  updateCreditCard,
  useCreditCards,
  useInvalidateCreditCards,
  type CreditCard as Card,
} from "@/lib/credit_cards";

type Draft = { name: string; last_four: string; billing_day: string };

const emptyDraft: Draft = { name: "", last_four: "", billing_day: "10" };

export function CreditCardsSection() {
  const { data: cards = [], isLoading } = useCreditCards();
  const invalidate = useInvalidateCreditCards();
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Card | null>(null);

  function openNew() {
    setDraft(emptyDraft);
    setEditing("new");
  }

  function openEdit(c: Card) {
    setDraft({ name: c.name, last_four: c.last_four, billing_day: String(c.billing_day) });
    setEditing(c);
  }

  async function save() {
    const name = draft.name.trim();
    const day = Number(draft.billing_day);
    if (!name) {
      toast.error("נא להזין שם לכרטיס");
      return;
    }
    if (draft.last_four.replace(/\D/g, "").length !== 4) {
      toast.error("נא להזין 4 ספרות אחרונות");
      return;
    }
    if (!day || day < 1 || day > 31) {
      toast.error("יום חיוב חייב להיות בין 1 ל-31");
      return;
    }
    setSaving(true);
    try {
      const payload = { name, last_four: draft.last_four, billing_day: day };
      if (editing === "new") await createCreditCard(payload);
      else if (editing) await updateCreditCard(editing.id, payload);
      invalidate();
      setEditing(null);
      toast.success("נשמר");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteCreditCard(toDelete.id);
      invalidate();
      toast.success("הכרטיס נמחק");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה במחיקה");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <CreditCard className="size-4" />
        כרטיסי אשראי
      </h2>
      <div className="rounded-2xl bg-card border p-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            עדיין לא הוספתם כרטיסים. הוסיפו כרטיס כדי לשייך הוצאות ולראות חיובים קרובים.
          </p>
        ) : (
          <ul className="divide-y -my-1">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{cardLabel(c)}</p>
                  <p className="text-xs text-muted-foreground">חיוב ב-{c.billing_day} בכל חודש</p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  aria-label="ערוך כרטיס"
                  className="size-9 rounded-full border flex items-center justify-center"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setToDelete(c)}
                  aria-label="מחק כרטיס"
                  className="size-9 rounded-full border border-destructive/40 text-destructive flex items-center justify-center"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={openNew}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Plus className="size-4" />
          הוסף כרטיס
        </button>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {editing === "new" ? "כרטיס חדש" : "עריכת כרטיס"}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="סגור"
                className="size-9 rounded-full bg-background border flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">שם הכרטיס</label>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={40}
                placeholder="ויזה של שירי"
                className="w-full h-11 mt-1 rounded-xl bg-background border px-3 text-sm outline-none"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">4 ספרות אחרונות</label>
                <input
                  value={draft.last_four}
                  onChange={(e) =>
                    setDraft({ ...draft, last_four: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  inputMode="numeric"
                  maxLength={4}
                  dir="ltr"
                  placeholder="1234"
                  className="w-full h-11 mt-1 rounded-xl bg-background border px-3 text-sm outline-none tracking-widest"
                />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground">יום חיוב</label>
                <input
                  value={draft.billing_day}
                  onChange={(e) =>
                    setDraft({ ...draft, billing_day: e.target.value.replace(/\D/g, "").slice(0, 2) })
                  }
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="10"
                  className="w-full h-11 mt-1 rounded-xl bg-background border px-3 text-sm outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {saving ? "שומר…" : "שמור"}
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את הכרטיס?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${cardLabel(toDelete)} יימחק. ` : ""}
              התנועות הקיימות יישארו, אבל הן לא ישויכו יותר לכרטיס הזה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
