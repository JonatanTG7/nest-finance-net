import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Camera, CheckCircle2, Images, Loader2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/dates";
import { shrinkImageFile } from "@/lib/image-shrink";
import { extractIbPortfolio, type IbPortfolioScan } from "@/lib/ib-sync.functions";
import {
  checkSyncTotals,
  draftFromRecognized,
  findDuplicateDraftSymbols,
  parseSyncCash,
  parseSyncRowDraft,
  planSyncOps,
  type RecognizedPosition,
  type SyncPlan,
  type SyncRowDraft,
} from "@/lib/ib-sync-rules";
import { applyIbSync, fetchIbHoldings, fetchIbPositions, type IbPortfolio } from "@/lib/ib";

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function fmtUsd(n: number): string {
  return usdFmt.format(n);
}

/**
 * "📸 סנכרן מ-IBKR": read a portfolio screenshot with AI and apply it — only
 * after the user reviews the before/after table and presses "אשר ועדכן".
 * Nothing is ever applied automatically. Symbols missing from the screenshot
 * are left untouched, and a totals mismatch is shown as a clear warning.
 *
 * The user can fix the recognized rows by hand (quantity / average price),
 * add a stock manually, and edit the cash amount (amount only). Every edit
 * re-plans the sync and re-checks the totals live; invalid rows block the
 * confirmation with a clear message.
 */
export function PortfolioSyncDialog({
  open,
  onOpenChange,
  portfolios,
  initialAccountId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  portfolios: IbPortfolio[];
  initialAccountId: string | null;
  onApplied: () => void;
}) {
  const extractFn = useServerFn(extractIbPortfolio);
  const [targetId, setTargetId] = useState<string>("");
  const [scan, setScan] = useState<IbPortfolioScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [editedRows, setEditedRows] = useState<SyncRowDraft[] | null>(null);
  // null = untouched: the field shows the recognized cash (or the current
  // cash when nothing was recognized), and follows the live cash balance.
  const [cashInput, setCashInput] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const keyCounter = useRef(0);

  function resetScan() {
    setScan(null);
    setEditedRows(null);
    setCashInput(null);
  }

  useEffect(() => {
    if (!open) return;
    setTargetId(initialAccountId ?? portfolios[0]?.id ?? "");
    resetScan();
  }, [open, initialAccountId, portfolios]);

  const { data: holdings } = useQuery({
    queryKey: ["ib", "holdings", targetId],
    queryFn: () => fetchIbHoldings(targetId),
    enabled: open && !!targetId,
  });
  const { data: positions = [] } = useQuery({
    queryKey: ["ib", "positions", targetId],
    queryFn: () => fetchIbPositions(targetId),
    enabled: open && !!targetId,
  });

  const currentCash = Number(holdings?.cash_usd ?? 0);

  // --- Editable plan: drafts -> validated recognized positions -> plan ------
  const parsedRows = useMemo(
    () =>
      (editedRows ?? []).map((row) => ({
        key: row.key,
        row,
        parsed: parseSyncRowDraft(row),
      })),
    [editedRows],
  );
  const duplicateSymbols = useMemo(
    () => new Set(findDuplicateDraftSymbols(editedRows ?? [])),
    [editedRows],
  );
  const rowErrors = useMemo(() => {
    const errors = new Map<string, string>();
    for (const { key, row, parsed } of parsedRows) {
      if (!parsed.ok) {
        errors.set(key, parsed.error);
      } else if (duplicateSymbols.has(parsed.recognized.symbol)) {
        errors.set(key, "סימבול כפול — כל מניה מופיעה פעם אחת בלבד");
      }
    }
    return errors;
  }, [parsedRows, duplicateSymbols]);
  const effectiveRecognized = useMemo(() => {
    const out: RecognizedPosition[] = [];
    for (const { key, parsed } of parsedRows) {
      if (parsed.ok && !rowErrors.has(key)) out.push(parsed.recognized);
    }
    return out;
  }, [parsedRows, rowErrors]);
  const plan: SyncPlan | null =
    scan?.ok != null && scan.ok
      ? planSyncOps(
          positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, avgPrice: p.avg_price })),
          effectiveRecognized,
        )
      : null;
  const planRowBySymbol = useMemo(
    () => new Map((plan?.rows ?? []).map((r) => [r.symbol, r])),
    [plan],
  );

  const cashValue =
    cashInput == null
      ? scan?.ok
        ? (scan.cashUsd ?? currentCash)
        : currentCash
      : parseSyncCash(cashInput);
  const cashError =
    cashInput != null && parseSyncCash(cashInput) == null
      ? "מזומן חייב להיות מספר שאינו שלילי"
      : null;
  const totalsCheck = scan?.ok
    ? checkSyncTotals(effectiveRecognized, cashValue, scan.totalValueUsd)
    : null;
  const cashWillChange = cashValue != null && Math.abs(cashValue - currentCash) > 0.005;
  const hasErrors = rowErrors.size > 0 || cashError != null;
  const canApply = plan != null && !hasErrors && (plan.hasChanges || cashWillChange);

  function updateRow(key: string, patch: Partial<SyncRowDraft>) {
    setEditedRows((rows) => (rows ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setEditedRows((rows) => (rows ?? []).filter((r) => r.key !== key));
  }

  function addManualRow() {
    keyCounter.current += 1;
    setEditedRows((rows) => [
      ...(rows ?? []),
      {
        key: `manual-${keyCounter.current}`,
        symbol: "",
        quantity: "",
        avgPrice: "",
        marketValue: null,
        baseQuantity: null,
        manual: true,
      },
    ]);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    resetScan();
    try {
      const dataUrl = await shrinkImageFile(file);
      const res = await extractFn({ data: { imageBase64: dataUrl, mediaType: "image/jpeg" } });
      if (!res.ok) {
        toast.error(res.error ?? "לא הצלחנו לקרוא את צילום המסך");
        setScan(res);
        return;
      }
      setScan(res);
      setEditedRows(res.positions.map((p, i) => draftFromRecognized(p, `scan-${i}`)));
    } catch (err) {
      console.error(err);
      toast.error("לא הצלחנו לקרוא את התמונה");
    } finally {
      setScanning(false);
    }
  }

  async function handleApply() {
    if (!plan || !targetId || cashValue == null) return;
    setApplying(true);
    try {
      const res = await applyIbSync({
        accountId: targetId,
        cashUsd: cashValue,
        ops: plan.ops,
        occurredAt: todayISO(),
      });
      toast.success(
        res.opsApplied > 0 ? `התיק סונכרן — ${res.opsApplied} פעולות עודכנו` : "המזומן עודכן",
      );
      onApplied();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(`שגיאה בסנכרון: ${(e as Error)?.message ?? "לא ידועה"}`);
    } finally {
      setApplying(false);
    }
  }

  const targetName = portfolios.find((p) => p.id === targetId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📸 סנכרן מ-IBKR</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm" htmlFor="sync-target">
              תיק יעד
            </label>
            <select
              id="sync-target"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                resetScan();
              }}
              className="w-full h-10 border rounded-md bg-background px-3 text-sm"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              צלם את מסך הפורטפוליו ב-IBKR (מניות, כמויות, מחיר קנייה ומזומן). התמונה נשלחת לפענוח
              בלבד ולא נשמרת בשום מקום.
            </p>
          </div>

          {!scan && (
            <div className="flex gap-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                className="flex-1"
                onClick={() => cameraRef.current?.click()}
                disabled={scanning || !targetId}
              >
                {scanning ? (
                  <Loader2 className="size-4 me-1 animate-spin" />
                ) : (
                  <Camera className="size-4 me-1" />
                )}
                {scanning ? "מפענח…" : "צלם מסך"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => galleryRef.current?.click()}
                disabled={scanning || !targetId}
              >
                <Images className="size-4 me-1" />
                בחר תמונה
              </Button>
            </div>
          )}

          {scan && !scan.ok && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">לא הצלחנו לפענח את הצילום</p>
              <p className="text-muted-foreground mt-1">{scan.error ?? "נסה צילום ברור יותר"}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={resetScan}>
                נסה צילום אחר
              </Button>
            </div>
          )}

          {scan?.ok && plan && (
            <>
              {scan.confidence === "low" && (
                <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                  <p>רמת ביטחון נמוכה בפענוח — בדוק היטב כל שורה לפני האישור.</p>
                </div>
              )}

              {totalsCheck?.checked ? (
                totalsCheck.ok ? (
                  <div className="flex gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                    <p>
                      הסכומים תואמים: סך הפוזיציות + מזומן ={" "}
                      <span className="tabular-nums font-semibold" dir="ltr">
                        {fmtUsd(totalsCheck.actual ?? 0)}
                      </span>{" "}
                      מול סה״כ בצילום{" "}
                      <span className="tabular-nums font-semibold" dir="ltr">
                        {fmtUsd(totalsCheck.expected ?? 0)}
                      </span>
                      .
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <p>
                      <span className="font-semibold">אזהרה: הסכומים לא תואמים.</span> סך הפוזיציות
                      + מזומן ={" "}
                      <span className="tabular-nums font-semibold" dir="ltr">
                        {fmtUsd(totalsCheck.actual ?? 0)}
                      </span>{" "}
                      אבל הסה״כ בצילום הוא{" "}
                      <span className="tabular-nums font-semibold" dir="ltr">
                        {fmtUsd(totalsCheck.expected ?? 0)}
                      </span>{" "}
                      (הפרש{" "}
                      <span className="tabular-nums" dir="ltr">
                        {fmtUsd(totalsCheck.diff ?? 0)}
                      </span>
                      ). ייתכן שהצילום חתוך או שהפענוח שגוי — בדוק לפני אישור.
                    </p>
                  </div>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  לא ניתן לבדוק התאמת סכומים — חסר שווי כולל או שווי פוזיציות בצילום.
                </p>
              )}

              <div className="rounded-xl border p-3 text-sm space-y-2">
                <label className="block font-medium" htmlFor="sync-cash">
                  מזומן (USD)
                </label>
                <Input
                  id="sync-cash"
                  dir="ltr"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={cashInput ?? String(scan.cashUsd ?? currentCash)}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  מזומן נוכחי בתיק:{" "}
                  <span className="tabular-nums" dir="ltr">
                    {fmtUsd(currentCash)}
                  </span>
                  {scan.cashUsd == null && " · לא זוהה בצילום — מוצג המזומן הנוכחי"}
                </p>
                {cashError && <p className="text-xs text-destructive">{cashError}</p>}
              </div>

              <div className="space-y-2">
                {(editedRows ?? []).map((draft) => {
                  const planRow = planRowBySymbol.get(draft.symbol.trim().toUpperCase());
                  const error = rowErrors.get(draft.key);
                  return (
                    <div key={draft.key} className="rounded-xl border p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {draft.manual ? (
                          <Input
                            aria-label="סימבול"
                            dir="ltr"
                            value={draft.symbol}
                            onChange={(e) =>
                              updateRow(draft.key, { symbol: e.target.value.toUpperCase() })
                            }
                            placeholder="סימבול (למשל IVV)"
                            className="h-8 w-36 font-semibold uppercase"
                          />
                        ) : (
                          <span className="font-semibold" dir="ltr">
                            {draft.symbol}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          {planRow && (
                            <span
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                                planRow.action === "buy" && "bg-emerald-500/15 text-emerald-500",
                                planRow.action === "sell" && "bg-rose-500/15 text-rose-400",
                                planRow.action === "adjust" && "bg-amber-500/15 text-amber-500",
                                planRow.action === "none" && "bg-muted text-muted-foreground",
                              )}
                            >
                              {planRow.action === "buy"
                                ? "קנייה"
                                : planRow.action === "sell"
                                  ? "מכירה"
                                  : planRow.action === "adjust"
                                    ? "עדכון ממוצע"
                                    : "ללא שינוי"}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label={`הסר את ${draft.symbol || "השורה"}`}
                            onClick={() => removeRow(draft.key)}
                          >
                            <X className="size-4" />
                          </Button>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs text-muted-foreground">
                          כמות
                          <Input
                            dir="ltr"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            value={draft.quantity}
                            onChange={(e) => updateRow(draft.key, { quantity: e.target.value })}
                            className="mt-1 h-8 tabular-nums"
                          />
                        </label>
                        <label className="block text-xs text-muted-foreground">
                          מחיר ממוצע ($)
                          <Input
                            dir="ltr"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            value={draft.avgPrice}
                            onChange={(e) => updateRow(draft.key, { avgPrice: e.target.value })}
                            placeholder="—"
                            className="mt-1 h-8 tabular-nums"
                          />
                        </label>
                      </div>
                      {planRow && (
                        <>
                          <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                            {planRow.currentQty != null
                              ? `${planRow.currentQty.toLocaleString("en-US", { maximumFractionDigits: 4 })} × ${fmtUsd(planRow.currentAvg ?? 0)}`
                              : "חדשה"}
                            {"  →  "}
                            {planRow.recognizedQty.toLocaleString("en-US", {
                              maximumFractionDigits: 4,
                            })}{" "}
                            × {planRow.recognizedAvg != null ? fmtUsd(planRow.recognizedAvg) : "—"}
                          </p>
                          <p className="text-xs">{planRow.note}</p>
                        </>
                      )}
                      {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                  );
                })}
                {(editedRows ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    לא זוהו מניות בצילום.
                  </p>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={addManualRow}>
                  <Plus className="size-4 me-1" />
                  הוסף מניה
                </Button>
              </div>

              {plan.untouchedSymbols.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  סמלים שלא זוהו בצילום לא ישתנו:{" "}
                  <span dir="ltr">{plan.untouchedSymbols.join(", ")}</span>
                </p>
              )}

              {hasErrors && (
                <p className="text-sm text-center text-destructive">
                  יש לתקן את השגיאות המסומנות לפני האישור.
                </p>
              )}

              {!canApply && !hasErrors && (
                <p className="text-sm text-center text-muted-foreground">
                  התיק כבר מסונכרן — אין שינויים לאשר.
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetScan}>
                  צילום אחר
                </Button>
                <Button className="flex-1" onClick={handleApply} disabled={!canApply || applying}>
                  {applying ? "מעדכן…" : `אשר ועדכן את ${targetName}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
