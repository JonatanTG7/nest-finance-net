import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { IbPosition } from "@/lib/ib";

export function BuyDialog({
  open,
  onOpenChange,
  position,
  currentCash,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Existing position to add shares to, or null to open a brand-new position. */
  position: IbPosition | null;
  currentCash: number;
  onSave: (input: {
    symbol: string;
    quantity: number;
    price: number;
    occurred_at: string;
    adjustCash: boolean;
  }) => Promise<void>;
}) {
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [adjustCash, setAdjustCash] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSymbol(position?.symbol ?? "");
    setQty("");
    setPrice("");
    setDate(new Date().toISOString().slice(0, 10));
    setAdjustCash(true);
  }, [open, position]);

  const q = parseFloat(qty);
  const p = parseFloat(price);
  const cost = !isNaN(q) && !isNaN(p) ? q * p : null;

  async function submit() {
    const s = symbol.trim().toUpperCase();
    if (!s || isNaN(q) || q <= 0 || isNaN(p) || p < 0 || !date) return;
    setBusy(true);
    try {
      await onSave({ symbol: s, quantity: q, price: p, occurred_at: date, adjustCash });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? `קניית מניות נוספות · ${position.symbol}` : "הוספת החזקה חדשה"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="buy-sym">סימבול</Label>
            <Input
              id="buy-sym"
              dir="ltr"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="IVV"
              disabled={!!position}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="buy-qty">כמות מניות</Label>
              <Input
                id="buy-qty"
                type="number"
                step="0.0001"
                inputMode="decimal"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buy-price">מחיר קנייה (USD)</Label>
              <Input
                id="buy-price"
                type="number"
                step="0.0001"
                inputMode="decimal"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="450.25"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="buy-date">תאריך</Label>
            <Input id="buy-date" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {cost != null && (
            <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
              עלות כוללת: {cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={adjustCash} onCheckedChange={(v) => setAdjustCash(!!v)} />
            הפחת אוטומטית מהמזומן ({currentCash.toLocaleString("en-US", { style: "currency", currency: "USD" })})
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={busy}>
            קנה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

//.