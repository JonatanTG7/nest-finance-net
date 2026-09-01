import { useState, useEffect } from "react";
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

export function CashDialog({
  open,
  onOpenChange,
  currentCash,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentCash: number;
  onSave: (usd: number) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(currentCash ? String(currentCash) : "");
  }, [open, currentCash]);

  async function submit() {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) return;
    setBusy(true);
    try {
      await onSave(n);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עדכון יתרת מזומן (USD)</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cash">יתרה בדולרים</Label>
          <Input
            id="cash"
            type="number"
            inputMode="decimal"
            step="0.01"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">
            הזן את סכום המזומן החופשי (CASH) שיש לך כרגע בחשבון ה-IB.
          </p>
        </div>
        <DialogFooter>
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
