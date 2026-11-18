import { MoreVertical, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { maskAmountText } from "@/lib/privacy";

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

const PHASE_LABEL: Partial<Record<MarketPhase, string>> = {
  PRE: "Pre",
  POST: "After",
};

// IBKR style: plain numbers, no currency symbols, no "+" prefix —
// green/red carries the sign. Zero reads as green, like in IBKR.
function fmtNum(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function fmtQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function pnlClass(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

/**
 * IBKR mobile Positions table: dense, always dark, English, LTR.
 * Column set matches the IBKR app (Instrument, Last Price, daily P&L,
 * Chg %, Unrlzd P&L, Unrlzd P&L %, Avg Price, Market Value). Quantity is
 * shown under the symbol — IBKR shows the exchange there, which we don't
 * have, so the slot carries the share count instead. No quick +/- actions:
 * buy/sell go through the full dialogs with an entered quantity, and delete
 * is handled by the parent with a confirmation dialog.
 */
export function PositionsTable({
  rows,
  sortKey,
  sortDir,
  hidden = false,
  onToggleSort,
  onBuy,
  onSell,
  onDelete,
}: {
  rows: PositionRowData[];
  sortKey: PositionSortKey;
  sortDir: "asc" | "desc";
  /** Privacy mode: mask all amounts with asterisks (symbols stay visible). */
  hidden?: boolean;
  onToggleSort: (k: PositionSortKey) => void;
  onBuy: (row: PositionRowData) => void;
  onSell: (row: PositionRowData) => void;
  onDelete: (row: PositionRowData) => void;
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
            title={`Sort by ${label}`}
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
    <div dir="ltr" className="overflow-x-auto bg-zinc-950 text-zinc-100">
      <table className="w-full border-collapse text-sm min-w-[780px]">
        <thead>
          <tr>
            {header(
              "Instrument",
              "symbol",
              "sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800",
            )}
            {header("Last Price")}
            {header("P&L")}
            {header("Chg %")}
            {header("Unrlzd P&L", "unrealized")}
            {header("Unrlzd P&L %")}
            {header("Avg Price")}
            {header("Market Value", "marketValue")}
            <th className="sticky right-0 z-10 bg-zinc-950 border-l border-zinc-800 px-2 py-2 border-b border-zinc-800">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-800/70 hover:bg-zinc-900/70">
              <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-2 whitespace-nowrap border-r border-zinc-800">
                <span className="font-bold">{r.symbol}</span>
                <span className="block text-[11px] font-normal text-zinc-500 tabular-nums">
                  {maskAmountText(fmtQty(r.quantity), hidden)} shares
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <span>{r.last != null ? maskAmountText(fmtNum(r.last), hidden) : "—"}</span>
                  {r.stale && r.last != null && (
                    <WifiOff className="size-3 text-zinc-500" aria-label="Stale price" />
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
                  pnlClass(r.dailyChangeAbs),
                )}
              >
                {r.dailyChangeAbs != null ? maskAmountText(fmtNum(r.dailyChangeAbs), hidden) : "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 tabular-nums whitespace-nowrap",
                  pnlClass(r.dailyChangePct),
                )}
              >
                {r.dailyChangePct != null ? maskAmountText(fmtPct(r.dailyChangePct), hidden) : "—"}
              </td>
              <td
                className={cn("px-3 py-2 tabular-nums whitespace-nowrap", pnlClass(r.unrealized))}
              >
                {r.unrealized != null ? maskAmountText(fmtNum(r.unrealized), hidden) : "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 tabular-nums whitespace-nowrap",
                  pnlClass(r.unrealizedPct),
                )}
              >
                {r.unrealizedPct != null ? maskAmountText(fmtPct(r.unrealizedPct), hidden) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                {maskAmountText(fmtNum(r.avgPrice), hidden)}
              </td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                <span className="font-medium">{maskAmountText(fmtNum(r.marketValue), hidden)}</span>
              </td>
              <td className="sticky right-0 z-10 bg-zinc-950 px-1 py-2 border-l border-zinc-800">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
                      aria-label={`Actions for ${r.symbol}`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onBuy(r)}>Buy</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSell(r)}>Sell</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(r)}
                    >
                      <Trash2 className="size-4 me-2" />
                      Delete Position
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
