import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { IbPosition } from "@/lib/ib";

export function SellDialog({
  open,
  onOpenChange,
  position,
  currentCash,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  position: IbPosition | null;
  currentCash: number;
  onSave: (input: {
    quantity: number;
    price: number;
    occurred_at: string;
    adjustCash: boolean;
  }) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [adjustCash, setAdjustCash] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty("");
    setPrice("");
    setDate(new Date().toISOString().slice(0, 10));
    setAdjustCash(true);
  }, [open, position]);

  if (!position) return null;

  const q = parseFloat(qty);
  const p = parseFloat(price);
  const proceeds = !isNaN(q) && !isNaN(p) ? q * p : null;
  const realizedPnl = !isNaN(q) && !isNaN(p) ? (p - position.avg_price) * q : null;
  const overSell = !isNaN(q) && q > position.quantity;

  async function submit() {
    if (isNaN(q) || q <= 0 || isNaN(p) || p < 0 || !date || overSell) return;
    setBusy(true);
    try {
      await onSave({ quantity: q, price: p, occurred_at: date, adjustCash });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>מכירת {position.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
            מחזיק כרגע: {position.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ·
            מחיר ממוצע{" "}
            {position.avg_price.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sell-qty">כמות למכירה</Label>
              <Input
                id="sell-qty"
                type="number"
                step="0.0001"
                inputMode="decimal"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
              />
              {overSell && <p className="text-xs text-destructive">אין מספיק מניות בהחזקה</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sell-price">מחיר מכירה בפועל (USD)</Label>
              <Input
                id="sell-price"
                type="number"
                step="0.0001"
                inputMode="decimal"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="40.00"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sell-date">תאריך</Label>
            <Input
              id="sell-date"
              type="date"
              dir="ltr"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {proceeds != null && (
            <div className="text-xs space-y-0.5" dir="ltr">
              <p className="text-muted-foreground tabular-nums">
                תמורה: {proceeds.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
              {realizedPnl != null && (
                <p
                  className={cn(
                    "tabular-nums font-medium",
                    realizedPnl >= 0 ? "text-emerald-500" : "text-rose-400",
                  )}
                >
                  רווח/הפסד ממומש: {realizedPnl >= 0 ? "+" : ""}
                  {realizedPnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={adjustCash} onCheckedChange={(v) => setAdjustCash(!!v)} />
            הוסף אוטומטית למזומן (
            {currentCash.toLocaleString("en-US", { style: "currency", currency: "USD" })})
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={busy || overSell}>
            מכור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

//.
