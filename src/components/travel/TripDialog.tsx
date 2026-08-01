import { useEffect, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
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
import { uploadTripCover, type Trip, type TripInput } from "@/lib/trips";

const CURRENCIES = ["ILS", "USD", "EUR", "GBP", "JPY"];

export function TripDialog({
  open,
  onOpenChange,
  trip,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trip: Trip | null;
  onSave: (input: TripInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [cities, setCities] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [cover, setCover] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(trip?.name ?? "");
    setCountry(trip?.country ?? "");
    setCities(trip?.cities ?? "");
    setStart(trip?.start_date ?? today);
    setEnd(trip?.end_date ?? today);
    setBudget(trip ? String(trip.budget) : "");
    setCurrency(trip?.currency ?? "ILS");
    setCover(trip?.cover_image ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setCover(await uploadTripCover(file));
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בהעלאת תמונה");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("נא להזין שם לטיול");
      return;
    }
    if (end < start) {
      toast.error("תאריך הסיום לפני תאריך ההתחלה");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        country: country.trim(),
        cities: cities.trim() || null,
        start_date: start,
        end_date: end,
        budget: parseFloat(budget) || 0,
        currency,
        cover_image: cover.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    if (!confirm("למחוק את הטיול? התנועות עצמן יישמרו.")) return;
    setBusy(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{trip ? "עריכת טיול" : "טיול חדש"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>שם הטיול</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="יפן 2027" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>מדינה</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="יפן" />
            </div>
            <div className="space-y-1.5">
              <Label>מטבע</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ערים (מופרדות בפסיק)</Label>
            <Input
              value={cities}
              onChange={(e) => setCities(e.target.value)}
              placeholder="טוקיו, אוסקה, קיוטו"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך התחלה</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>תאריך סיום</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>תקציב</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="35000"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label>תמונת רקע (קישור או העלאה)</Label>
            <div className="flex gap-2">
              <Input
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                placeholder="https://…"
                dir="ltr"
              />
              <label className="flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-card">
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
            </div>
            {cover && (
              <img
                src={cover}
                alt="תמונת הטיול"
                className="mt-2 h-28 w-full rounded-2xl border object-cover"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {trip && onDelete ? (
            <Button variant="ghost" onClick={remove} disabled={busy} className="text-destructive">
              מחק טיול
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
