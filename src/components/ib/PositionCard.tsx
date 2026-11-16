import { useState } from "react";
import { ChevronDown, History, Minus, Plus, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/finance";
import { toIls } from "@/lib/ib-rules";

export type MarketPhase = "REGULAR" | "PRE" | "POST" | "CLOSED";

export interface PositionCardData {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  last: number | null;
  phase: MarketPhase;
  stale: boolean;
  marketValue: number;
  unrealized: number | null;
  unrealizedPct: number | null;
  dailyChangeAbs: number | null;
  dailyChangePct: number | null;
  weight: number | null;
}

const PHASE_LABEL: Record<MarketPhase, string> = {
  REGULAR: "Regular",
  PRE: "Pre",
  POST: "After",
  CLOSED: "Closed",
};

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function fmtUsd(n: number): string {
  return usdFmt.format(n);
}
function fmtSignedUsd(n: number): string {
  return `${n >= 0 ? "+" : "-"}${fmtUsd(Math.abs(n))}`;
}
function fmtSignedPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/**
 * Robinhood-style mobile stock card: ticker + shares, current price and total
 * value ($ and ₪), a colored return badge ($, ₪ and %), quick +/- actions
 * (1 share at the live price, recorded in the ledger like a normal trade),
 * and expandable full details. Delete is handled by the parent with a
 * confirmation dialog — never a silent one-tap delete.
 */
export function PositionCard({
  data: r,
  fxRate,
  busy,
  onQuickBuy,
  onQuickSell,
  onBuy,
  onSell,
  onHistory,
  onDelete,
}: {
  data: PositionCardData;
  /** USD→ILS rate, or null when unavailable (no ₪ values are shown then). */
  fxRate: number | null;
  busy: boolean;
  onQuickBuy: () => void;
  onQuickSell: () => void;
  onBuy: () => void;
  onSell: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = r.unrealized;
  const pnlIls = pnl != null ? toIls(pnl, fxRate) : null;
  const marketIls = toIls(r.marketValue, fxRate);
  const dailyIls = r.dailyChangeAbs != null ? toIls(r.dailyChangeAbs, fxRate) : null;
  const canQuickTrade = r.last != null && !busy;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5" dir="ltr">
            <span className="text-lg font-bold tracking-tight">{r.symbol}</span>
            {r.stale && r.last != null && (
              <WifiOff className="size-3.5 text-muted-foreground" aria-label="מחיר לא מעודכן" />
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
            {r.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} shares
            {r.weight != null && ` · ${r.weight.toFixed(1)}% מהתיק`}
          </p>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums" dir="ltr">
            {r.last != null ? fmtUsd(r.last) : "—"}
            <span className="uppercase tracking-wide"> · {PHASE_LABEL[r.phase]}</span>
          </p>
        </div>

        <div className="text-end shrink-0">
          <p className="text-lg font-bold tabular-nums" dir="ltr">
            {fmtUsd(r.marketValue)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {marketIls != null ? `≈ ${formatILS(marketIls)}` : "שער ₪ לא זמין"}
          </p>
          {pnl != null ? (
            <span
              className={cn(
                "inline-block mt-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                pnl >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-400",
              )}
              dir="ltr"
            >
              {fmtSignedUsd(pnl)}
              {r.unrealizedPct != null && ` · ${fmtSignedPct(r.unrealizedPct)}`}
              {pnlIls != null && (
                <span className="block text-[10px] opacity-80" dir="rtl">
                  {pnlIls >= 0 ? "+" : "−"}
                  {formatILS(Math.abs(pnlIls))}
                </span>
              )}
            </span>
          ) : (
            <span className="inline-block mt-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground">
              אין מחיר חי
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5"
          disabled={!canQuickTrade}
          title={r.last == null ? "אין מחיר חי — השתמש ב״קנה״" : "מכור מניה אחת במחיר החי"}
          onClick={onQuickSell}
        >
          <Minus className="size-4" />
          <span className="sr-only">מכור אחת</span>1
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5"
          disabled={!canQuickTrade}
          title={r.last == null ? "אין מחיר חי — השתמש ב״קנה״" : "קנה מניה אחת במחיר החי"}
          onClick={onQuickBuy}
        >
          <Plus className="size-4" />
          <span className="sr-only">קנה אחת</span>1
        </Button>
        <Button size="sm" variant="secondary" className="h-8" onClick={onBuy}>
          קנה
        </Button>
        <Button size="sm" variant="secondary" className="h-8" onClick={onSell}>
          מכור
        </Button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ms-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          פרטים
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-1.5 text-sm">
          <DetailRow label="מחיר ממוצע" value={fmtUsd(r.avgPrice)} ltr />
          <DetailRow
            label="שינוי יומי"
            value={
              r.dailyChangeAbs == null ? (
                "—"
              ) : (
                <span className={cn(r.dailyChangeAbs >= 0 ? "text-emerald-500" : "text-rose-400")}>
                  {fmtSignedUsd(r.dailyChangeAbs)}
                  {r.dailyChangePct != null && ` (${fmtSignedPct(r.dailyChangePct)})`}
                  {dailyIls != null &&
                    ` · ${dailyIls >= 0 ? "+" : "−"}${formatILS(Math.abs(dailyIls))}`}
                </span>
              )
            }
            ltr
          />
          <DetailRow
            label="משקל בתיק"
            value={r.weight != null ? `${r.weight.toFixed(1)}%` : "—"}
            ltr
          />
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" className="h-8" onClick={onHistory}>
              <History className="size-4 me-1" />
              היסטוריית תנועות
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-4 me-1" />
              מחיקה מלאה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  ltr,
}: {
  label: string;
  value: React.ReactNode;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums" dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}
