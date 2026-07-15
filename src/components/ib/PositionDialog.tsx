import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { IbPosition } from "@/lib/ib";

export function PositionDialog({
  open,
  onOpenChange,
  position,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  position: IbPosition | null;
  onSave: (input: { id?: string; symbol: string; quantity: number; avg_price: number }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSymbol(position?.symbol ?? "");
    setQty(position ? String(position.quantity) : "");
    setAvg(position ? String(position.avg_price) : "");
  }, [open, position]);

  async function submit() {
    const s = symbol.trim().toUpperCase();
    const q = parseFloat(qty);
    const a = parseFloat(avg);
    if (!s || isNaN(q) || isNaN(a)) return;
    setBusy(true);
    try {
      await onSave({ id: position?.id, symbol: s, quantity: q, avg_price: a });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!position || !onDelete) return;
    setBusy(true);
    try {
      await onDelete(position.id);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? "עריכת החזקה" : "הוספת החזקה"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sym">סימבול</Label>
            <Input
              id="sym"
              dir="ltr"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="IVV"
              disabled={!!position}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qty">כמות מניות</Label>
            <Input
              id="qty"
              type="number"
              step="0.0001"
              inputMode="decimal"
              dir="ltr"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="11.4019"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="avg">מחיר קנייה ממוצע (USD)</Label>
            <Input
              id="avg"
              type="number"
              step="0.0001"
              inputMode="decimal"
              dir="ltr"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
              placeholder="450.25"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {position && onDelete && (
            <Button variant="destructive" onClick={remove} disabled={busy} className="me-auto">
              מחק
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={busy}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
