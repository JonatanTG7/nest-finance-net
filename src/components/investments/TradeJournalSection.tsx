import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, NotebookPen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  createTradeJournalEntry,
  deleteTradeJournalEntry,
  fetchTradeJournalEntries,
  filterJournalEntriesBySymbol,
  tradeJournalSummary,
  updateTradeJournalEntry,
  type TradeJournalEntry,
  type TradeJournalInput,
  type TradeSide,
} from "@/lib/trade-journal";
import { todayISO } from "@/lib/dates";
import { maskAmountText } from "@/lib/privacy";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function fmtPnl(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const SIDE_LABEL: Record<TradeSide, string> = { long: "לונג", short: "שורט" };

/**
 * Trading journal on a non-IB investment account page (e.g. the Colmex Pro
 * day-trading account): a dense professional table, one row per trade,
 * newest first. Each trade's P&L counts toward the displayed account
 * balance (trades logged after the last manual balance reset). When
 * `hidden` is set (a private account not revealed inside its page),
 * the P&L amounts mask like every other amount on the page.
 */
export function TradeJournalSection({
  accountId,
  hidden = false,
}: {
  accountId: string;
  /** Mask the P&L amounts (private account, not revealed inside). */
  hidden?: boolean;
}) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TradeJournalEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TradeJournalEntry | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["trade-journal", accountId],
    queryFn: () => fetchTradeJournalEntries(accountId),
  });
  const filteredEntries = filterJournalEntriesBySymbol(entries, symbolFilter);
  // The summary covers the filtered trades, so filtering to one ticker
  // shows that asset's trade count and total P&L.
  const summary = tradeJournalSummary(filteredEntries);

  const remove = useMutation({
    mutationFn: deleteTradeJournalEntry,
    onSuccess: () => {
      // Prefix invalidation refreshes both the per-account query and the
      // household-wide one the assets index uses for card balances.
      qc.invalidateQueries({ queryKey: ["trade-journal"] });
      toast.success("העסקה נמחקה");
    },
    onError: () => toast.error("שגיאה במחיקת העסקה"),
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: TradeJournalEntry) => {
    setEditing(e);
    setFormOpen(true);
  };

  return (
    <section className="px-5 md:px-0 mt-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <NotebookPen className="size-4" />
          יומן עסקאות
        </h2>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="size-4" />
          עסקה חדשה
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        הרווח או ההפסד של כל עסקה מתווסף ליתרת החשבון.
      </p>

      {entries.length > 0 && (
        <div className="relative mb-3">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            placeholder="חיפוש לפי טיקר…"
            aria-label="חיפוש עסקאות לפי טיקר"
            className="ps-9 pe-9"
            dir="ltr"
          />
          {symbolFilter && (
            <button
              type="button"
              onClick={() => setSymbolFilter("")}
              aria-label="נקה סינון"
              title="נקה סינון"
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {filteredEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums",
              summary.totalPnl >= 0 ? "text-emerald-500" : "text-rose-400",
            )}
            dir="ltr"
          >
            P&amp;L מצטבר: {maskAmountText(fmtPnl(summary.totalPnl), hidden)}
          </span>
          <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {summary.count} עסקאות
          </span>
          <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {summary.wins} רווח · {summary.losses} הפסד
            {summary.winRate != null && ` · ${Math.round(summary.winRate * 100)}% הצלחה`}
          </span>
        </div>
      )}

      <div className="rounded-2xl border bg-card overflow-x-auto">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">טוען…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">אין עדיין עסקאות מתועדות.</p>
        ) : filteredEntries.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">אין עסקאות לטיקר הזה.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setSymbolFilter("")}
            >
              נקה סינון
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm min-w-[620px]">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  תאריך
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                  טיקר
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                  כיוון
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  יחידות
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  רווח/הפסד
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                  הערה
                </th>
                {/* Sticky actions column (same pattern as the IB PositionsTable):
                    in this RTL table the actions column is the leftmost one,
                    so it sticks to the left edge and stays reachable on a
                    phone without scrolling the table sideways. bg-card is
                    opaque so row text doesn't show through while scrolling. */}
                <th className="sticky left-0 z-10 bg-card border-r border-border px-2 py-2 w-10">
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {fmtDate(e.occurred_at)}
                  </td>
                  <td className="px-3 py-2 font-bold whitespace-nowrap" dir="ltr">
                    {e.symbol}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={cn(
                        "text-[11px] font-semibold rounded-full px-2 py-0.5",
                        e.side === "long"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-400",
                      )}
                    >
                      {SIDE_LABEL[e.side as TradeSide] ?? e.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                    {Number(e.quantity).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums font-semibold whitespace-nowrap",
                      Number(e.pnl_usd) >= 0 ? "text-emerald-500" : "text-rose-400",
                    )}
                    dir="ltr"
                  >
                    {maskAmountText(fmtPnl(Number(e.pnl_usd)), hidden)}
                  </td>
                  <td
                    className="px-3 py-2 text-muted-foreground max-w-[180px] truncate"
                    title={e.note || undefined}
                  >
                    {e.note}
                  </td>
                  <td className="sticky left-0 z-10 bg-card border-r border-border px-1 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`פעולות לעסקת ${e.symbol}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(e)}>
                          <Pencil className="size-4 me-2" />
                          ערוך
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(e)}
                        >
                          <Trash2 className="size-4 me-2" />
                          מחק
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `עריכת עסקה · ${editing.symbol}` : "עסקה חדשה"}</DialogTitle>
          </DialogHeader>
          <TradeJournalForm
            key={editing?.id ?? "new"}
            accountId={accountId}
            entry={editing}
            onSaved={() => {
              // Prefix invalidation refreshes both the per-account query and
              // the household-wide one the assets index uses for card balances.
              qc.invalidateQueries({ queryKey: ["trade-journal"] });
              setFormOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את העסקה?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `עסקת ${deleteTarget.symbol} (${SIDE_LABEL[deleteTarget.side as TradeSide] ?? deleteTarget.side}) מ-${fmtDate(deleteTarget.occurred_at)} תימחק לצמיתות, ויתרת החשבון תתעדכן בהתאם.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TradeJournalForm({
  accountId,
  entry,
  onSaved,
}: {
  accountId: string;
  entry: TradeJournalEntry | null;
  onSaved: () => void;
}) {
  const [symbol, setSymbol] = useState(entry?.symbol ?? "");
  const [side, setSide] = useState<TradeSide>((entry?.side as TradeSide) ?? "long");
  const [quantity, setQuantity] = useState(entry ? String(entry.quantity) : "");
  const [pnl, setPnl] = useState(entry ? String(entry.pnl_usd) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(entry?.occurred_at ?? todayISO());
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    const pnlNum = Number(pnl);
    if (!symbol.trim()) {
      toast.error("נא להזין טיקר");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("כמות היחידות חייבת להיות גדולה מ-0");
      return;
    }
    if (pnl === "" || !Number.isFinite(pnlNum)) {
      toast.error("נא להזין רווח/הפסד בדולרים (יכול להיות שלילי)");
      return;
    }
    if (!date) {
      toast.error("נא לבחור תאריך");
      return;
    }
    setBusy(true);
    try {
      const input: TradeJournalInput = {
        symbol: symbol.trim(),
        side,
        quantity: qty,
        pnl_usd: pnlNum,
        note: note.trim(),
        occurred_at: date,
      };
      if (entry) {
        await updateTradeJournalEntry(entry.id, input);
        toast.success("העסקה עודכנה");
      } else {
        await createTradeJournalEntry(accountId, input);
        toast.success("העסקה נוספה");
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error("לא הצלחנו לשמור את העסקה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tj-symbol">טיקר</Label>
          <Input
            id="tj-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="NVDA"
            dir="ltr"
            maxLength={12}
            required
            autoCapitalize="characters"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tj-date">תאריך</Label>
          <Input
            id="tj-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>כיוון</Label>
        <div className="flex gap-2" role="group" aria-label="כיוון העסקה">
          {(["long", "short"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-semibold border transition",
                side === s
                  ? s === "long"
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-rose-500 text-white border-rose-500"
                  : "bg-card border-border",
              )}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tj-qty">יחידות</Label>
          <Input
            id="tj-qty"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="10"
            dir="ltr"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tj-pnl">רווח / הפסד ($)</Label>
          <Input
            id="tj-pnl"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={pnl}
            onChange={(e) => setPnl(e.target.value)}
            placeholder="0.00"
            dir="ltr"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tj-note">הערה</Label>
        <textarea
          id="tj-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="מה עבד, מה לא…"
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "שומר…" : entry ? "שמור שינויים" : "הוסף עסקה"}
      </Button>
    </form>
  );
}
