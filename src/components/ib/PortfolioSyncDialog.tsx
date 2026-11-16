import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Camera, CheckCircle2, Images, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/dates";
import { shrinkImageFile } from "@/lib/image-shrink";
import { extractIbPortfolio, type IbPortfolioScan } from "@/lib/ib-sync.functions";
import { checkSyncTotals, planSyncOps, type SyncPlan } from "@/lib/ib-sync-rules";
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTargetId(initialAccountId ?? portfolios[0]?.id ?? "");
    setScan(null);
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
  const plan: SyncPlan | null =
    scan?.ok != null && scan.ok
      ? planSyncOps(
          positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, avgPrice: p.avg_price })),
          scan.positions,
        )
      : null;
  const totalsCheck = scan?.ok
    ? checkSyncTotals(scan.positions, scan.cashUsd, scan.totalValueUsd)
    : null;
  const recognizedCash = scan?.ok ? scan.cashUsd : null;
  const cashWillChange = recognizedCash != null && Math.abs(recognizedCash - currentCash) > 0.005;
  const canApply = plan != null && (plan.hasChanges || cashWillChange);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setScan(null);
    try {
      const dataUrl = await shrinkImageFile(file);
      const res = await extractFn({ data: { imageBase64: dataUrl, mediaType: "image/jpeg" } });
      if (!res.ok) {
        toast.error(res.error ?? "לא הצלחנו לקרוא את צילום המסך");
        setScan(res);
        return;
      }
      setScan(res);
    } catch (err) {
      console.error(err);
      toast.error("לא הצלחנו לקרוא את התמונה");
    } finally {
      setScanning(false);
    }
  }

  async function handleApply() {
    if (!plan || !targetId) return;
    setApplying(true);
    try {
      const res = await applyIbSync({
        accountId: targetId,
        cashUsd: recognizedCash ?? currentCash,
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
                setScan(null);
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
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setScan(null)}>
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

              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">מזומן</p>
                <p className="tabular-nums mt-1" dir="ltr">
                  {fmtUsd(currentCash)} →{" "}
                  {recognizedCash != null ? fmtUsd(recognizedCash) : "לא זוהה — יישאר ללא שינוי"}
                </p>
              </div>

              <div className="space-y-2">
                {plan.rows.map((r) => (
                  <div key={r.symbol} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold" dir="ltr">
                        {r.symbol}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                          r.action === "buy" && "bg-emerald-500/15 text-emerald-500",
                          r.action === "sell" && "bg-rose-500/15 text-rose-400",
                          r.action === "adjust" && "bg-amber-500/15 text-amber-500",
                          r.action === "none" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.action === "buy"
                          ? "קנייה"
                          : r.action === "sell"
                            ? "מכירה"
                            : r.action === "adjust"
                              ? "עדכון ממוצע"
                              : "ללא שינוי"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums" dir="ltr">
                      {r.currentQty != null
                        ? `${r.currentQty.toLocaleString("en-US", { maximumFractionDigits: 4 })} × ${fmtUsd(r.currentAvg ?? 0)}`
                        : "חדשה"}
                      {"  →  "}
                      {r.recognizedQty.toLocaleString("en-US", { maximumFractionDigits: 4 })} ×{" "}
                      {r.recognizedAvg != null ? fmtUsd(r.recognizedAvg) : "—"}
                    </p>
                    <p className="text-xs mt-1">{r.note}</p>
                  </div>
                ))}
                {plan.rows.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    לא זוהו מניות בצילום.
                  </p>
                )}
              </div>

              {plan.untouchedSymbols.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  סמלים שלא זוהו בצילום לא ישתנו:{" "}
                  <span dir="ltr">{plan.untouchedSymbols.join(", ")}</span>
                </p>
              )}

              {!canApply && (
                <p className="text-sm text-center text-muted-foreground">
                  התיק כבר מסונכרן — אין שינויים לאשר.
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setScan(null)}>
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
