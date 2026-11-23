import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { TrackPicker } from "@/components/investments/TrackPicker";
import {
  PRIVATE_ACCOUNT_KINDS,
  PRIVATE_KIND_LABELS,
  createPrivateAccount,
  deletePrivateAccount,
  updatePrivateAccount,
  type PrivateAccountForm,
} from "@/lib/private-accounts";
import { fetchTrackAllocations, saveTrackAllocations } from "@/lib/track-splits";
import { rowFromAllocation, rowsToInputs, splitCanSave, type PickerRow } from "@/lib/track-picker";
import { useHouseholdPersons, useMemberLabels, type Person } from "@/lib/person";
import { usePrivacyMode } from "@/lib/privacy";
import type { InvestmentAccount } from "@/lib/db";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person the account belongs to when adding (fixed). Ignored when editing. */
  person: Person;
  /** The account to edit, or null to add a new one. */
  account: InvestmentAccount | null;
  /** Pre-fill for a quick-add template (create mode only): kind + name suggestion. */
  initialKind?: string;
  initialName?: string;
  /** Called after a successful delete (e.g. to navigate away). */
  onDeleted?: () => void;
}

function formFromAccount(
  a: InvestmentAccount | null,
  initialKind?: string,
  initialName?: string,
): PrivateAccountForm {
  return {
    name: a?.name ?? initialName ?? "",
    kind: a?.kind ?? initialKind ?? "pension",
    company: a?.company ?? "",
    fee_from_balance: a?.fee_from_balance != null ? String(a.fee_from_balance) : "",
    fee_from_deposits: a?.fee_from_deposits != null ? String(a.fee_from_deposits) : "",
    track: a?.track ?? "",
  };
}

/**
 * Add / edit dialog for a private account (pension, study fund,
 * provident...): name, type, managing company, the two management fees,
 * and the track split (preset chips + percentages, right here at
 * creation — no need to create first and split later). The single
 * free-text "מסלול" field only shows when no split rows exist; once
 * tracks are picked it is cleared, since the split replaces it.
 * The balance is only set when adding; afterwards it is updated on the
 * account page (with its own balance history), never here.
 */
export function PrivateAccountDialog({
  open,
  onOpenChange,
  person,
  account,
  initialKind,
  initialName,
  onDeleted,
}: Props) {
  const qc = useQueryClient();
  const { persons } = useHouseholdPersons();
  const labels = useMemberLabels();
  const { hidden } = usePrivacyMode();
  const editing = account != null;

  const [form, setForm] = useState<PrivateAccountForm>(() =>
    formFromAccount(account, initialKind, initialName),
  );
  const [owner, setOwner] = useState<Person>(person);
  const [currency, setCurrency] = useState("ILS");
  const [balance, setBalance] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tracks, setTracks] = useState<PickerRow[]>([]);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  // Guards the one-time track init per open, so a refetch while the
  // dialog is open never overwrites the user's edits.
  const tracksInitRef = useRef<string | null>(null);

  // The account's existing tracks (edit mode only). Same query key as
  // the account page and the split editor, so the fetch is shared.
  const allocationsQuery = useQuery({
    queryKey: ["track-allocations", account?.id],
    queryFn: () => fetchTrackAllocations(account?.id ?? ""),
    enabled: open && editing && account != null,
  });

  // Reset the form every time the dialog opens (or the account changes),
  // so stale values from a previous edit never leak into the next one.
  useEffect(() => {
    if (!open) return;
    setForm(formFromAccount(account, initialKind, initialName));
    setOwner(((account?.person ?? person) as Person) ?? "shared");
    setCurrency("ILS");
    setBalance("");
    setConfirmDelete(false);
    setTracks([]);
    setTracksLoaded(false);
    tracksInitRef.current = null;
  }, [open, account, person, initialKind, initialName]);

  // Initialize the track picker once per open: empty when creating, the
  // account's tracks when editing. Until the tracks load, the picker
  // stays empty and the save skips them — an edit must never delete
  // tracks it has not seen yet.
  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setTracksLoaded(true);
      return;
    }
    if (allocationsQuery.isSuccess && tracksInitRef.current !== (account?.id ?? null)) {
      tracksInitRef.current = account?.id ?? null;
      setTracks(allocationsQuery.data.map(rowFromAllocation));
      setTracksLoaded(true);
    }
  }, [open, editing, allocationsQuery.isSuccess, allocationsQuery.data, account]);

  const set = (patch: Partial<PrivateAccountForm>) => setForm((f) => ({ ...f, ...patch }));

  const invalidate = (accountId?: string) => {
    qc.invalidateQueries({ queryKey: ["investment_accounts"] });
    if (accountId) {
      qc.invalidateQueries({ queryKey: ["private-account-history", accountId] });
      qc.invalidateQueries({ queryKey: ["track-allocations", accountId] });
    }
    qc.invalidateQueries({ queryKey: ["track-allocations", "all"] });
  };

  const canSaveSplit = splitCanSave(tracks, false);

  const save = useMutation({
    mutationFn: async () => {
      // Once tracks are picked, the split replaces the free-text track.
      const formToSave = tracks.length > 0 ? { ...form, track: "" } : form;
      let savedId: string;
      if (editing) {
        await updatePrivateAccount(account, { ...formToSave, person: owner });
        savedId = account.id;
        // Only touch the tracks when they were actually loaded — a save
        // before the fetch finished must not wipe them. "keep": the
        // dialog is balance-only, so a deposits split set in the editor
        // must survive an edit save.
        if (tracksLoaded) {
          await saveTrackAllocations(savedId, rowsToInputs(tracks, "keep"));
        }
      } else {
        savedId = await createPrivateAccount({
          ...formToSave,
          person,
          currency,
          balance: Number(balance || 0),
        });
        if (tracks.length > 0) {
          await saveTrackAllocations(savedId, rowsToInputs(tracks, "keep"));
        }
      }
      return savedId;
    },
    onSuccess: (savedId) => {
      invalidate(savedId);
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
      invalidate(account?.id);
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
            {editing && !tracksLoaded && !allocationsQuery.isError ? (
              <p className="text-xs text-muted-foreground">טוען מסלולים…</p>
            ) : (
              <TrackPicker
                rows={tracks}
                onChange={setTracks}
                depositsEnabled={false}
                onDepositsEnabledChange={() => {}}
                hidden={hidden}
              />
            )}
            {allocationsQuery.isError && (
              <p className="text-xs text-muted-foreground">
                לא הצלחנו לטעון את המסלולים — העריכה שלהם לא תישמר הפעם.
              </p>
            )}
            {tracks.length === 0 && (
              <label className="block text-sm">
                מסלול
                <Input
                  aria-label="מסלול"
                  value={form.track}
                  onChange={(e) => set({ track: e.target.value })}
                  maxLength={100}
                  placeholder="מסלול יחיד, אם אין פיצול — לדוגמה: מניות"
                />
              </label>
            )}
            {!canSaveSplit && (
              <p className="text-xs text-destructive">
                אי אפשר לשמור: לכל מסלול צריך שם, ואסור שהסכום יעבור 100%.
              </p>
            )}
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
            <Button type="submit" disabled={save.isPending || !canSaveSplit} className="w-full">
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
