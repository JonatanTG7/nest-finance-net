import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, ScanText, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PRIVATE_ACCOUNT_KINDS,
  PRIVATE_KIND_LABELS,
  createPrivateAccount,
  kindLabel,
  updateAccountStatementColumns,
  updatePrivateAccount,
} from "@/lib/private-accounts";
import {
  deriveTrackType,
  fetchTrackAllocations,
  mergeImportedTracks,
  saveTrackAllocations,
} from "@/lib/track-splits";
import { scanStatement, MAX_STATEMENT_PAGES } from "@/lib/statement.functions";
import type { StatementFields } from "@/lib/statement-rules";
import { shrinkImageFile } from "@/lib/image-shrink";
import { SHARED_OWNER, type OwnerId } from "@/lib/person";
import type { InvestmentAccount } from "@/lib/db";
import { formatILS } from "@/lib/finance";

interface ReviewTrack {
  key: string;
  name: string;
  returnYearPct: number | null;
}

/**
 * Import a private account from its annual pension statement (דוח
 * שנתי): the user photographs the statement's pages (or screenshots
 * the PDF), the AI reads the standardized tables (company, type,
 * closing balance, fees, fund averages, expected pension, deposits,
 * track names + returns), the user reviews and corrects the fields,
 * then saves.
 *
 * Two modes: with no account it CREATES one (statement balance becomes
 * the initial balance); with an account it UPDATES the metadata and
 * merges the tracks. The statement lists NO allocation percentages,
 * so imported tracks start without one — the user adds them on the
 * account page afterwards. In update mode the balance is deliberately
 * NOT touched (balance changes go through the account page's update
 * flow, with its own history); the statement's closing balance is
 * shown for reference.
 *
 * The pages are shrunk in memory only and never stored anywhere.
 */
export function StatementImportDialog({
  open,
  onOpenChange,
  person,
  account,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner for a newly created account. Ignored in update mode. */
  person: OwnerId;
  /** The account to update, or null to create a new one. */
  account: InvestmentAccount | null;
  /** Create mode: called with the new account id after saving. */
  onCreated?: (accountId: string) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [addingPages, setAddingPages] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fields, setFields] = useState<StatementFields | null>(null);

  // Review form (strings, like the account dialog's fee fields).
  const [name, setName] = useState("");
  const [kind, setKind] = useState("pension");
  const [company, setCompany] = useState("");
  const [feeBalance, setFeeBalance] = useState("");
  const [feeDeposits, setFeeDeposits] = useState("");
  const [balance, setBalance] = useState("");
  const [expectedPension, setExpectedPension] = useState("");
  const [tracks, setTracks] = useState<ReviewTrack[]>([]);

  const { data: existingAllocations = [] } = useQuery({
    queryKey: ["track-allocations", account?.id],
    queryFn: () => fetchTrackAllocations(account!.id),
    enabled: open && account != null,
  });

  // Fresh state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setPages([]);
    setFields(null);
    setName("");
    setKind(account?.kind ?? "pension");
    setCompany("");
    setFeeBalance("");
    setFeeDeposits("");
    setBalance("");
    setExpectedPension("");
    setTracks([]);
  }, [open, account]);

  const startReview = (f: StatementFields) => {
    setFields(f);
    const label = f.productKind ? kindLabel(f.productKind) : "חשבון פרטי";
    setName(account?.name ?? (f.company ? `${label} ${f.company}` : (f.company ?? "")));
    setKind(f.productKind ?? account?.kind ?? "pension");
    setCompany(f.company ?? account?.company ?? "");
    setFeeBalance(
      f.feeFromBalance != null
        ? String(f.feeFromBalance)
        : account?.fee_from_balance != null
          ? String(account.fee_from_balance)
          : "",
    );
    setFeeDeposits(
      f.feeFromDeposits != null
        ? String(f.feeFromDeposits)
        : account?.fee_from_deposits != null
          ? String(account.fee_from_deposits)
          : "",
    );
    setBalance(f.balance != null ? String(f.balance) : "");
    setExpectedPension(f.expectedMonthlyPension != null ? String(f.expectedMonthlyPension) : "");
    setTracks(
      f.tracks.map((t) => ({
        key: crypto.randomUUID(),
        name: t.name,
        returnYearPct: t.returnYearPct,
      })),
    );
  };

  const addPages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_STATEMENT_PAGES - pages.length;
    if (remaining <= 0) {
      toast.info(`עד ${MAX_STATEMENT_PAGES} עמודים בכל סריקה`);
      return;
    }
    const picked = [...files].slice(0, remaining);
    setAddingPages(true);
    try {
      const dataUrls = await Promise.all(picked.map((f) => shrinkImageFile(f, 2000)));
      setPages((p) => [...p, ...dataUrls]);
      if (files.length > remaining) {
        toast.info(`נוספו ${remaining} עמודים (עד ${MAX_STATEMENT_PAGES} בכל סריקה)`);
      }
    } catch {
      toast.error("לא הצלחנו לקרוא את התמונות");
    } finally {
      setAddingPages(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const res = await scanStatement({
        data: { images: pages.map((p) => ({ imageBase64: p, mediaType: "image/jpeg" })) },
      });
      if (!res.ok) {
        toast.error(res.error ?? "הסריקה נכשלה");
        return;
      }
      startReview(res);
      toast.success("הדוח נקרא — בדוק את הפרטים ושמור");
    } catch (err) {
      console.error(err);
      toast.error("לא הצלחנו לקרוא את הדוח");
    } finally {
      setScanning(false);
    }
  };

  const save = useMutation({
    mutationFn: async (): Promise<string | null> => {
      if (!fields) throw new Error("no_fields");
      const reviewed: StatementFields = {
        ...fields,
        company: company.trim() || null,
        productKind: kind as StatementFields["productKind"],
        balance: balance === "" ? null : Number(balance),
        feeFromBalance: feeBalance === "" ? null : Number(feeBalance),
        feeFromDeposits: feeDeposits === "" ? null : Number(feeDeposits),
        expectedMonthlyPension: expectedPension === "" ? null : Number(expectedPension),
        tracks: tracks
          .filter((t) => t.name.trim() !== "")
          .map((t) => ({ name: t.name.trim(), returnYearPct: t.returnYearPct })),
      };
      const form = {
        name: name.trim(),
        kind,
        company: company.trim(),
        fee_from_balance: feeBalance,
        fee_from_deposits: feeDeposits,
        track: account?.track ?? "",
        // A statement import never touches notes — carry the existing
        // ones through on update so an import can't wipe them.
        notes: account?.notes ?? "",
      };
      if (account) {
        await updatePrivateAccount(account, {
          ...form,
          person: account.person ?? SHARED_OWNER,
        });
        await updateAccountStatementColumns(account.id, reviewed);
        const { toSave } = mergeImportedTracks(existingAllocations, reviewed.tracks);
        await saveTrackAllocations(account.id, toSave);
        return null;
      }
      const id = await createPrivateAccount({
        ...form,
        person,
        currency: "ILS",
        balance: reviewed.balance ?? 0,
        statement: reviewed,
      });
      if (reviewed.tracks.length > 0) {
        await saveTrackAllocations(
          id,
          reviewed.tracks.map((t) => ({
            track_name: t.name,
            track_code: null,
            track_type: deriveTrackType(t.name),
            allocation_pct_balance: null,
            allocation_pct_deposits: null,
            return_year_pct: t.returnYearPct,
          })),
        );
      }
      return id;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      if (account) {
        qc.invalidateQueries({ queryKey: ["track-allocations", account.id] });
        qc.invalidateQueries({ queryKey: ["private-account-history", account.id] });
      }
      qc.invalidateQueries({ queryKey: ["track-allocations", "all"] });
      toast.success(
        account
          ? "הפרטים עודכנו מהדוח"
          : tracks.length > 0
            ? "החשבון נוצר מהדוח — הוסף את אחוזי המסלולים בעמוד החשבון"
            : "החשבון נוצר מהדוח",
      );
      onOpenChange(false);
      if (newId) onCreated?.(newId);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "לא הצלחנו לשמור. נסה שוב.");
    },
  });

  const reviewing = fields != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? `ייבוא מדוח — ${account.name}` : "ייבוא מדוח שנתי"}</DialogTitle>
        </DialogHeader>

        {!reviewing ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              צלם את עמודי הדוח השנתי (או צילום מסך מקובץ ה־PDF) — עד {MAX_STATEMENT_PAGES} עמודים.
              הדוח נקרא מהטבלאות הקבועות שלו: חברה, סוג, יתרה, דמי ניהול, קצבה צפויה ומסלולים.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPages(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={addingPages || pages.length >= MAX_STATEMENT_PAGES}
              onClick={() => fileRef.current?.click()}
            >
              {addingPages ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              {pages.length === 0 ? "בחר עמודים לסריקה" : "הוסף עמודים"}
            </Button>
            {pages.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {pages.map((p, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden border aspect-[3/4]">
                    <img src={p} alt={`עמוד ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 end-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                      onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))}
                      aria-label={`הסר עמוד ${i + 1}`}
                    >
                      <X className="size-3.5" />
                    </button>
                    <span className="absolute bottom-1 start-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              שים לב: הדוח השנתי לא כולל את אחוזי הפיצול בין המסלולים — אותם מוסיפים אחר כך ידנית,
              מהאזור האישי או מדוח המסלקה הפנסיונית.
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={pages.length === 0 || scanning}
              onClick={() => void scan()}
            >
              {scanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanText className="size-4" />
              )}
              {scanning ? "קורא את הדוח…" : `סרוק את הדוח (${pages.length} עמודים)`}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              בדוק את הפרטים שנקראו מהדוח ותקן אם צריך, ואז שמור.
            </p>
            <label className="block text-sm">
              שם החשבון
              <Input
                aria-label="שם החשבון"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                סוג חשבון
                <select
                  aria-label="סוג חשבון"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
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
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  maxLength={100}
                />
              </label>
            </div>
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
                  value={feeBalance}
                  onChange={(e) => setFeeBalance(e.target.value)}
                  placeholder="—"
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
                  value={feeDeposits}
                  onChange={(e) => setFeeDeposits(e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
            {!account ? (
              <label className="block text-sm">
                יתרת סגירה (₪)
                <Input
                  aria-label="יתרת סגירה"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0"
                />
              </label>
            ) : (
              fields.balance != null && (
                <p className="text-sm text-muted-foreground">
                  יתרת סגירה בדוח:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {formatILS(fields.balance)}
                  </span>{" "}
                  — היתרה לא משתנה בייבוא; לעדכון השתמש ב״עדכון סכום״ בעמוד החשבון.
                </p>
              )
            )}
            <label className="block text-sm">
              קצבה חודשית צפויה (₪)
              <Input
                aria-label="קצבה חודשית צפויה"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={expectedPension}
                onChange={(e) => setExpectedPension(e.target.value)}
                placeholder="—"
              />
            </label>

            {tracks.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">
                  מסלולים מהדוח{" "}
                  <span className="font-normal text-muted-foreground">(ללא אחוזים)</span>
                </p>
                <div className="space-y-2">
                  {tracks.map((t) => (
                    <div key={t.key} className="flex items-center gap-2">
                      <Input
                        aria-label="שם המסלול"
                        value={t.name}
                        onChange={(e) =>
                          setTracks((ts) =>
                            ts.map((x) => (x.key === t.key ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        maxLength={100}
                        className="flex-1"
                      />
                      <div className="relative w-24 shrink-0">
                        <Input
                          aria-label="תשואה שנתית באחוזים"
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={t.returnYearPct ?? ""}
                          onChange={(e) =>
                            setTracks((ts) =>
                              ts.map((x) =>
                                x.key === t.key
                                  ? {
                                      ...x,
                                      returnYearPct:
                                        e.target.value === "" ? null : Number(e.target.value),
                                    }
                                  : x,
                              ),
                            )
                          }
                          placeholder="—"
                          className="pe-6 text-center tabular-nums"
                        />
                        <span className="absolute start-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-destructive"
                        onClick={() => setTracks((ts) => ts.filter((x) => x.key !== t.key))}
                        aria-label={`הסר את ${t.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  אחוזי הפיצול לא מופיעים בדוח — אחרי השמירה אפשר להוסיף אותם בעמוד החשבון.
                </p>
              </div>
            )}

            {(fields.treasuryCode ||
              fields.avgFeeFromBalance != null ||
              fields.avgFeeFromDeposits != null ||
              fields.deposits.employee != null ||
              fields.deposits.employer != null ||
              fields.deposits.severance != null) && (
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                {fields.treasuryCode && (
                  <p>
                    קוד האוצר:{" "}
                    <span className="text-foreground tabular-nums" dir="ltr">
                      {fields.treasuryCode}
                    </span>
                  </p>
                )}
                {(fields.avgFeeFromBalance != null || fields.avgFeeFromDeposits != null) && (
                  <p className="tabular-nums">
                    דמי ניהול ממוצעים בקרן:{" "}
                    <span className="text-foreground">
                      {fields.avgFeeFromBalance != null
                        ? `${fields.avgFeeFromBalance}% מצבירה`
                        : "—"}
                      {" · "}
                      {fields.avgFeeFromDeposits != null
                        ? `${fields.avgFeeFromDeposits}% מהפקדות`
                        : "—"}
                    </span>
                  </p>
                )}
                {(fields.deposits.employee != null ||
                  fields.deposits.employer != null ||
                  fields.deposits.severance != null) && (
                  <p className="tabular-nums">
                    הפקדה חודשית אחרונה:{" "}
                    <span className="text-foreground">
                      {[
                        fields.deposits.employee != null &&
                          `עובד ${formatILS(fields.deposits.employee)}`,
                        fields.deposits.employer != null &&
                          `מעביד ${formatILS(fields.deposits.employer)}`,
                        fields.deposits.severance != null &&
                          `פיצויים ${formatILS(fields.deposits.severance)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setFields(null);
                  setTracks([]);
                }}
              >
                חזרה לסריקה
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={name.trim() === "" || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "שומר…" : account ? "עדכן מהדוח" : "צור חשבון מהדוח"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
