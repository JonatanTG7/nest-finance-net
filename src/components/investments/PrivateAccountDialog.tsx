import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  PRIVATE_ACCOUNT_KINDS,
  PRIVATE_KIND_LABELS,
  createPrivateAccount,
  deletePrivateAccount,
  updatePrivateAccount,
  type PrivateAccountForm,
} from "@/lib/private-accounts";
import { useHouseholdPersons, useMemberLabels, type Person } from "@/lib/person";
import type { InvestmentAccount } from "@/lib/db";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person the account belongs to when adding (fixed). Ignored when editing. */
  person: Person;
  /** The account to edit, or null to add a new one. */
  account: InvestmentAccount | null;
  /** Called after a successful delete (e.g. to navigate away). */
  onDeleted?: () => void;
}

function formFromAccount(a: InvestmentAccount | null): PrivateAccountForm {
  return {
    name: a?.name ?? "",
    kind: a?.kind ?? "pension",
    company: a?.company ?? "",
    fee_from_balance: a?.fee_from_balance != null ? String(a.fee_from_balance) : "",
    fee_from_deposits: a?.fee_from_deposits != null ? String(a.fee_from_deposits) : "",
    track: a?.track ?? "",
  };
}

/**
 * Add / edit dialog for a private account (pension, study fund,
 * provident...): name, type, managing company, the two management fees,
 * track, and — when editing — the owner. The balance is only set when
 * adding; afterwards it is updated on the account page (with its own
 * balance history), never here.
 */
export function PrivateAccountDialog({ open, onOpenChange, person, account, onDeleted }: Props) {
  const qc = useQueryClient();
  const { persons } = useHouseholdPersons();
  const labels = useMemberLabels();
  const editing = account != null;

  const [form, setForm] = useState<PrivateAccountForm>(() => formFromAccount(account));
  const [owner, setOwner] = useState<Person>(person);
  const [currency, setCurrency] = useState("ILS");
  const [balance, setBalance] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form every time the dialog opens (or the account changes),
  // so stale values from a previous edit never leak into the next one.
  useEffect(() => {
    if (!open) return;
    setForm(formFromAccount(account));
    setOwner(((account?.person ?? person) as Person) ?? "shared");
    setCurrency("ILS");
    setBalance("");
    setConfirmDelete(false);
  }, [open, account, person]);

  const set = (patch: Partial<PrivateAccountForm>) => setForm((f) => ({ ...f, ...patch }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["investment_accounts"] });
    if (account) {
      qc.invalidateQueries({ queryKey: ["private-account-history", account.id] });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        await updatePrivateAccount(account, { ...form, person: owner });
      } else {
        await createPrivateAccount({
          ...form,
          person,
          currency,
          balance: Number(balance || 0),
        });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? "החשבון עודכן" : "החשבון נוסף");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "לא הצלחנו לשמור. נסה שוב.");
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("no_account");
      await deletePrivateAccount(account);
    },
    onSuccess: () => {
      invalidate();
      toast.success("החשבון נמחק");
      setConfirmDelete(false);
      onOpenChange(false);
      onDeleted?.();
    },
    onError: () => toast.error("שגיאה במחיקת החשבון"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת חשבון פרטי" : "חשבון פרטי חדש"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              שם החשבון
              <Input
                aria-label="שם החשבון"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                required
                maxLength={100}
                placeholder="לדוגמה: קרן פנסיה מנורה"
              />
            </label>
            <label className="block text-sm">
              סוג חשבון
              <select
                aria-label="סוג חשבון"
                value={form.kind}
                onChange={(e) => set({ kind: e.target.value })}
                className="w-full h-10 border rounded-md bg-background px-3"
              >
                {PRIVATE_ACCOUNT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PRIVATE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              חברה מנהלת
              <Input
                aria-label="חברה מנהלת"
                value={form.company}
                onChange={(e) => set({ company: e.target.value })}
                maxLength={100}
                placeholder="לדוגמה: מנורה מבטחים"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                דמי ניהול מצבירה (%)
                <Input
                  aria-label="דמי ניהול מצבירה באחוזים"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={form.fee_from_balance}
                  onChange={(e) => set({ fee_from_balance: e.target.value })}
                  placeholder="0.1"
                />
              </label>
              <label className="block text-sm">
                דמי ניהול מהפקדות (%)
                <Input
                  aria-label="דמי ניהול מהפקדות באחוזים"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={form.fee_from_deposits}
                  onChange={(e) => set({ fee_from_deposits: e.target.value })}
                  placeholder="1.5"
                />
              </label>
            </div>
            <label className="block text-sm">
              מסלול
              <Input
                aria-label="מסלול"
                value={form.track}
                onChange={(e) => set({ track: e.target.value })}
                maxLength={100}
                placeholder="לדוגמה: מניות, S&P 500"
              />
            </label>
            {editing ? (
              <label className="block text-sm">
                בעלים
                <select
                  aria-label="בעלים"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value as Person)}
                  className="w-full h-10 border rounded-md bg-background px-3"
                >
                  <option value="shared">{labels.shared}</option>
                  {persons.map((p) => (
                    <option key={p.person} value={p.person}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="block text-sm">
                  מטבע
                  <select
                    aria-label="מטבע"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full h-10 border rounded-md bg-background px-3"
                  >
                    {["ILS", "USD"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  יתרה התחלתית
                  <Input
                    aria-label="יתרה התחלתית"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    placeholder="0"
                  />
                </label>
              </>
            )}
            <Button type="submit" disabled={save.isPending} className="w-full">
              {save.isPending ? "שומר…" : editing ? "שמור שינויים" : "הוסף חשבון"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                מחק חשבון
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את החשבון?</AlertDialogTitle>
            <AlertDialogDescription>
              החשבון „{account?.name}” יימחק לצמיתות, יחד עם היסטוריית הפרטים שלו. תנועות שמקושרות
              אליו יישארו, בלי קישור לחשבון.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
