import { useEffect, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
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
import { cn } from "@/lib/utils";
import { createVoucher, uploadVoucherPhoto } from "@/lib/vouchers";
import { extractVoucherData } from "@/lib/vouchers.functions";
import { getDefaultPerson, useMemberLabels, type Person } from "@/lib/person";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function VoucherUploadDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const extract = useServerFn(extractVoucherData);
  const memberLabels = useMemberLabels();

  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [barcode, setBarcode] = useState("");
  const [expiry, setExpiry] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [person, setPerson] = useState<Person>("shared");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("ai");
    setImageUrl(null);
    setLabel("");
    setAmount("");
    setBarcode("");
    setExpiry("");
    setOccurredAt(todayISO());
    setPerson(getDefaultPerson());
    setNote(null);
    setScanning(false);
    setBusy(false);
  }, [open]);

  async function onPickFile(file: File) {
    setScanning(true);
    setNote(null);
    try {
      const [url, base64] = await Promise.all([
        uploadVoucherPhoto(file),
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(file);
        }),
      ]);
      setImageUrl(url);
      const res = await extract({
        data: { imageBase64: base64, mediaType: file.type || "image/jpeg" },
      });
      if (res.label) setLabel(res.label);
      if (res.amount != null) setAmount(String(res.amount));
      if (res.barcode) setBarcode(res.barcode);
      if (res.expiry_date) setExpiry(res.expiry_date);
      setNote(
        res.label || res.amount != null
          ? res.confidence === "high"
            ? "זוהה מהתמונה — בדוק ותקן אם צריך."
            : "זיהוי חלקי — השלם את החסר."
          : "לא הצלחתי לזהות פרטים מהתמונה, אפשר למלא ידנית.",
      );
    } catch (e) {
      console.error(e);
      setNote("שגיאה בהעלאת התמונה, אפשר למלא ידנית.");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    const face = parseFloat(amount);
    if (!label.trim() || isNaN(face)) return;
    setBusy(true);
    try {
      await createVoucher({
        label: label.trim(),
        face_value: face,
        remaining_value: face,
        currency: "ILS",
        barcode: barcode.trim() || null,
        expiry_date: expiry || null,
        image_url: mode === "ai" ? imageUrl : null,
        source: mode,
        entered_by: person,
        occurred_at: occurredAt,
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>שובר חדש</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          {([["ai", "מתמונה"], ["manual", "ידני"]] as [typeof mode, string][]).map(([k, t]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-semibold border transition",
                mode === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {mode === "ai" && (
          <div className="space-y-2">
            <label
              className={cn(
                "flex items-center justify-center gap-2 h-24 rounded-2xl border border-dashed bg-card text-sm text-muted-foreground cursor-pointer",
                scanning && "opacity-60 pointer-events-none",
              )}
            >
              {scanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  קורא את השובר…
                </>
              ) : imageUrl ? (
                <img src={imageUrl} alt="שובר" className="h-full rounded-xl object-contain" />
              ) : (
                <>
                  <Camera className="size-5" />
                  צילום / בחירת תמונה של השובר
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickFile(f);
                }}
              />
            </label>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-label">שם השובר</Label>
            <Input
              id="v-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="תן ביס — Be Pharm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-amount">סכום (₪)</Label>
              <Input
                id="v-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-date">תאריך</Label>
              <Input
                id="v-date"
                type="date"
                dir="ltr"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-barcode">ברקוד (אופציונלי)</Label>
              <Input
                id="v-barcode"
                dir="ltr"
                inputMode="numeric"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-expiry">תוקף (אופציונלי)</Label>
              <Input
                id="v-expiry"
                type="date"
                dir="ltr"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>של מי השובר</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["yonatan", "shiri", "shared"] as Person[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPerson(p)}
                  className={cn(
                    "h-10 rounded-xl text-sm border transition",
                    person === p
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card border-border",
                  )}
                >
                  {memberLabels[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={save} disabled={busy || scanning || !label.trim() || !amount}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
