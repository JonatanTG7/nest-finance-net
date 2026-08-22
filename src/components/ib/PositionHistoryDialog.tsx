import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchIbTransactions } from "@/lib/ib";
import { cn } from "@/lib/utils";

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PositionHistoryDialog({
  open,
  onOpenChange,
  initialSymbol,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fills the ticker filter when opened from a specific position's menu. */
  initialSymbol?: string | null;
}) {
  const [filter, setFilter] = useState("");

  // Reset (or pre-fill) the filter each time the dialog opens.
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setFilter(initialSymbol ?? "");
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const { data: allTxs = [], isLoading } = useQuery({
    queryKey: ["ib", "transactions", "all"],
    queryFn: () => fetchIbTransactions(),
    enabled: open,
  });

  const normalizedFilter = filter.trim().toUpperCase();
  const txs = useMemo(() => {
    if (!normalizedFilter) return allTxs;
    return allTxs.filter((t) => t.symbol.includes(normalizedFilter));
  }, [allTxs, normalizedFilter]);

  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    let realizedPnl = 0;
    for (const t of txs) {
      const total = t.quantity * t.price;
      if (t.kind === "buy") bought += total;
      else {
        sold += total;
        if (t.prior_avg_price != null) realizedPnl += (t.price - t.prior_avg_price) * t.quantity;
      }
    }
    return { bought, sold, realizedPnl };
  }, [txs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>היסטוריית תנועות</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            dir="ltr"
            value={filter}
            onChange={(e) => setFilter(e.target.value.toUpperCase())}
            placeholder="סמל (טיקר) — למשל IVV — ריק להצגת הכל"
            className="pr-9"
          />
        </div>

        {!isLoading && txs.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="rounded-xl border p-2">
              <p className="text-muted-foreground">נקנה</p>
              <p className="font-semibold tabular-nums" dir="ltr">
                {usdFmt.format(totals.bought)}
              </p>
            </div>
            <div className="rounded-xl border p-2">
              <p className="text-muted-foreground">נמכר</p>
              <p className="font-semibold tabular-nums" dir="ltr">
                {usdFmt.format(totals.sold)}
              </p>
            </div>
            <div className="rounded-xl border p-2">
              <p className="text-muted-foreground">רווח/הפסד ממומש</p>
              <p
                className={cn(
                  "font-semibold tabular-nums",
                  totals.realizedPnl >= 0 ? "text-emerald-500" : "text-rose-400",
                )}
                dir="ltr"
              >
                {totals.realizedPnl >= 0 ? "+" : ""}
                {usdFmt.format(totals.realizedPnl)}
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">טוען...</p>
        ) : txs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {normalizedFilter ? `אין תנועות עבור "${normalizedFilter}"` : "אין עדיין תנועות רשומות"}
          </p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {txs.map((t) => {
              const total = t.quantity * t.price;
              const pnl =
                t.kind === "sell" && t.prior_avg_price != null
                  ? (t.price - t.prior_avg_price) * t.quantity
                  : null;
              return (
                <div key={t.id} className="rounded-xl border p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" dir="ltr">
                        {t.symbol}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                          t.kind === "buy"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-rose-500/15 text-rose-400",
                        )}
                      >
                        {t.kind === "buy" ? "קנייה" : "מכירה"}
                      </span>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {new Date(t.occurred_at).toLocaleDateString("he-IL")}
                      </span>
                    </div>
                    <p className="text-sm mt-1 tabular-nums" dir="ltr">
                      {t.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} × {usdFmt.format(t.price)}
                    </p>
                    {pnl != null && (
                      <p
                        className={cn("text-xs tabular-nums", pnl >= 0 ? "text-emerald-500" : "text-rose-400")}
                        dir="ltr"
                      >
                        {pnl >= 0 ? "+" : ""}
                        {usdFmt.format(pnl)} רווח/הפסד
                      </p>
                    )}
                  </div>
                  <p className="font-semibold tabular-nums" dir="ltr">
                    {usdFmt.format(total)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
