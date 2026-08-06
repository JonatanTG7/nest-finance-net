import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatILS } from "@/lib/finance";
import { deleteVoucher, updateVoucher, type Voucher } from "@/lib/vouchers";

export function VoucherDetailDialog({
  voucher,
  open,
  onOpenChange,
  onChanged,
}: {
  voucher: Voucher | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [remaining, setRemaining] = useState("");
  const [barcode, setBarcode] = useState("");
  const [expiry, setExpiry] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !voucher) return;
    setLabel(voucher.label);
    setRemaining(String(Number(voucher.remaining_value)));
    setBarcode(voucher.barcode ?? "");
    setExpiry(voucher.expiry_date ?? "");
    setOccurredAt(voucher.occurred_at);
    setBusy(false);
  }, [open, voucher]);

  if (!voucher) return null;

  async function save(overrideRemaining?: number) {
    const rem = overrideRemaining ?? parseFloat(remaining);
    if (isNaN(rem)) return;
    setBusy(true);
    try {
      await updateVoucher(voucher!.id, {
        label: label.trim() || voucher!.label,
        remaining_value: rem,
        barcode: barcode.trim() || null,
        expiry_date: expiry || null,
        occurred_at: occurredAt,
      });
      onChanged();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteVoucher(voucher!.id);
      onChanged();
      setConfirmDelete(false);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{voucher.label}</DialogTitle>
          </DialogHeader>

          {voucher.image_url && (
            <img
              src={voucher.image_url}
              alt={voucher.label}
              className="w-full max-h-44 object-contain rounded-2xl border bg-card"
            />
          )}

          <p className="text-sm text-muted-foreground tabular-nums">
            יתרה נוכחית: {formatILS(Number(voucher.remaining_value))} מתוך{" "}
            {formatILS(Number(voucher.face_value))}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void save(0)} disabled={busy}>
              0 (נוצל)
            </Button>
            <Button
              variant="outline"
              onClick={() => void save(Number(voucher.face_value))}
              disabled={busy}
            >
              יתרה מלאה
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vd-remaining">עדכן יתרה (₪)</Label>
              <Input
                id="vd-remaining"
                type="number"
                inputMode="decimal"
                step="0.01"
                dir="ltr"
                value={remaining}
                onChange={(e) => setRemaining(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd-label">שם השובר</Label>
              <Input id="vd-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vd-barcode">ברקוד</Label>
                <Input
                  id="vd-barcode"
                  dir="ltr"
                  inputMode="numeric"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vd-expiry">תוקף</Label>
                <Input
                  id="vd-expiry"
                  type="date"
                  dir="ltr"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd-date">תאריך</Label>
              <Input
                id="vd-date"
                type="date"
                dir="ltr"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full h-11 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Trash2 className="size-4" />
            מחק שובר
          </button>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את השובר?</AlertDialogTitle>
            <AlertDialogDescription>
              הפעולה תמחק את "{voucher.label}" לצמיתות ולא ניתן לשחזר אותה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
