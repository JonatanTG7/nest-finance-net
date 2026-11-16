import { History, MoreVertical, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/finance";
import { positionCostBasis, toIls } from "@/lib/ib-rules";

export type MarketPhase = "REGULAR" | "PRE" | "POST" | "CLOSED";

export interface PositionRowData {
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
}

export type PositionSortKey = "symbol" | "marketValue" | "unrealized";

export interface PositionsTotals {
  marketValue: number;
  unrealized: number;
  unrealizedKnown: boolean;
  dailyChange: number;
  costBasis: number;
}

const PHASE_LABEL: Partial<Record<MarketPhase, string>> = {
  PRE: "Pre",
  POST: "After",
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
function fmtQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function pnlClass(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

/**
 * Dense professional positions table (IBKR / TradingView style), always dark.
 * Horizontal scroll on mobile with the symbol column pinned on the right and
 * the actions column pinned on the left. No quick +/- actions: buy/sell go
 * through the full dialogs with an entered quantity, and delete is handled by
 * the parent with a confirmation dialog.
 */
export function PositionsTable({
  rows,
  fxRate,
  sortKey,
  sortDir,
  onToggleSort,
  onBuy,
  onSell,
  onHistory,
  onDelete,
  totals,
}: {
  rows: PositionRowData[];
  /** USD→ILS rate, or null when unavailable (no ₪ values are shown then). */
  fxRate: number | null;
  sortKey: PositionSortKey;
  sortDir: "asc" | "desc";
  onToggleSort: (k: PositionSortKey) => void;
  onBuy: (row: PositionRowData) => void;
  onSell: (row: PositionRowData) => void;
  onHistory: (row: PositionRowData) => void;
  onDelete: (row: PositionRowData) => void;
  totals: PositionsTotals;
}) {
  const header = (label: string, sort?: PositionSortKey, className?: string): React.ReactNode => {
    const active = sort != null && sortKey === sort;
    const content = (
      <>
        {label}
        {active && <span className="text-[9px]">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
      </>
    );
    return (
      <th
        className={cn(
          "px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-zinc-400 whitespace-nowrap border-b border-zinc-800",
          className,
        )}
      >
        {sort ? (
          <button
            onClick={() => onToggleSort(sort)}
            className="hover:text-zinc-100"
            title={`מיין לפי ${label}`}
          >
            {content}
          </button>
        ) : (
          content
        )}
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100">
      <table className="w-full border-collapse text-sm min-w-[820px]">
        <thead>
          <tr>
            {header("סימבול", "symbol", "sticky right-0 z-10 bg-zinc-950 border-l border-zinc-800")}
            {header("כמות")}
            {header("מחיר אחרון")}
            {header("שינוי %")}
            {header("P&L יומי")}
            {header("רווח לא ממומש", "unrealized")}
            {header("מחיר ממוצע")}
            {header("בסיס עלות")}
            {header("שווי שוק", "marketValue")}
            <th className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-2 py-2 border-b border-zinc-800">
              <span className="sr-only">פעולות</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const costBasis = positionCostBasis(r.quantity, r.avgPrice);
            const marketIls = toIls(r.marketValue, fxRate);
            return (
              <tr key={r.id} className="border-b border-zinc-800/70 hover:bg-zinc-900/70">
                <td className="sticky right-0 z-10 bg-zinc-950 px-3 py-2 font-bold whitespace-nowrap border-l border-zinc-800">
                  <span dir="ltr">{r.symbol}</span>
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  {fmtQty(r.quantity)}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  <span className="inline-flex items-center gap-1">
                    {r.last != null ? fmtUsd(r.last) : "—"}
                    {r.stale && r.last != null && (
                      <WifiOff className="size-3 text-zinc-500" aria-label="מחיר לא מעודכן" />
                    )}
                    {r.last != null && PHASE_LABEL[r.phase] && (
                      <span className="text-[10px] text-zinc-500 uppercase">
                        {PHASE_LABEL[r.phase]}
                      </span>
                    )}
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 tabular-nums whitespace-nowrap",
                    pnlClass(r.dailyChangePct),
                  )}
                  dir="ltr"
                >
                  {r.dailyChangePct != null ? fmtSignedPct(r.dailyChangePct) : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 tabular-nums whitespace-nowrap",
                    pnlClass(r.dailyChangeAbs),
                  )}
                  dir="ltr"
                >
                  {r.dailyChangeAbs != null ? fmtSignedUsd(r.dailyChangeAbs) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  {r.unrealized != null ? (
                    <span className={cn("font-medium", pnlClass(r.unrealized))}>
                      {fmtSignedUsd(r.unrealized)}
                      {r.unrealizedPct != null && (
                        <span className="block text-[11px] opacity-90">
                          {fmtSignedPct(r.unrealizedPct)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  {fmtUsd(r.avgPrice)}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  {fmtUsd(costBasis)}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                  <span className="font-medium">{fmtUsd(r.marketValue)}</span>
                  {marketIls != null && (
                    <span className="block text-[11px] text-zinc-400">
                      ≈ {formatILS(marketIls)}
                    </span>
                  )}
                </td>
                <td className="sticky left-0 z-10 bg-zinc-950 px-1 py-2 border-r border-zinc-800">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
                        aria-label={`פעולות עבור ${r.symbol}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onBuy(r)}>קנה</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSell(r)}>מכור</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onHistory(r)}>
                        <History className="size-4 me-2" />
                        היסטוריית תנועות
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(r)}
                      >
                        <Trash2 className="size-4 me-2" />
                        מחיקה מלאה
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold border-t-2 border-zinc-700">
            <td className="sticky right-0 z-10 bg-zinc-950 px-3 py-2 whitespace-nowrap border-l border-zinc-800">
              סה״כ
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td
              className={cn(
                "px-3 py-2 tabular-nums whitespace-nowrap",
                pnlClass(totals.dailyChange),
              )}
              dir="ltr"
            >
              {fmtSignedUsd(totals.dailyChange)}
            </td>
            <td
              className={cn(
                "px-3 py-2 tabular-nums whitespace-nowrap",
                pnlClass(totals.unrealized),
              )}
              dir="ltr"
            >
              {fmtSignedUsd(totals.unrealized)}
              {!totals.unrealizedKnown && (
                <span className="block text-[10px] font-normal text-zinc-400">
                  חלקי — חסר מחיר חי
                </span>
              )}
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
              {fmtUsd(totals.costBasis)}
            </td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
              {fmtUsd(totals.marketValue)}
            </td>
            <td className="sticky left-0 z-10 bg-zinc-950 px-1 py-2 border-r border-zinc-800" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
