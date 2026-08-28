import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createTrip, updateTrip, uploadTripCover, type Trip, type TripInput } from "@/lib/trips";
import { cn } from "@/lib/utils";

const CURRENCIES = ["ILS", "USD", "EUR", "GBP", "JPY", "THB"] as const;

export function TripForm({ existing }: { existing?: Trip }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [country, setCountry] = useState(existing?.country ?? "");
  const [cities, setCities] = useState(existing?.cities ?? "");
  const [startDate, setStartDate] = useState(existing?.start_date ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(existing?.end_date ?? new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState(existing ? String(existing.budget) : "");
  const [currency, setCurrency] = useState(existing?.currency ?? "ILS");
  const [coverUrl, setCoverUrl] = useState<string | null>(existing?.cover_image ?? null);
  const [coverUrlDraft, setCoverUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = name.trim() && country.trim() && startDate && endDate && endDate >= startDate && parseFloat(budget) >= 0;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadTripCover(file);
      setCoverUrl(url);
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בהעלאת התמונה");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!valid) return;
    const input: TripInput = {
      name: name.trim(),
      country: country.trim(),
      cities: cities.trim() || null,
      start_date: startDate,
      end_date: endDate,
      budget: parseFloat(budget) || 0,
      currency,
      cover_image: coverUrl,
    };
    setSubmitting(true);
    try {
      if (existing) {
        await updateTrip(existing.id, input);
        toast.success("הטיול עודכן");
      } else {
        await createTrip(input);
        toast.success("הטיול נוצר");
      }
      qc.invalidateQueries({ queryKey: ["trips"] });
      navigate({ to: "/travel" });
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירת הטיול");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/travel" })} className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold">{existing ? "עריכת טיול" : "טיול חדש"}</h1>
      </header>

      <div className="px-5 md:px-0 pb-28 space-y-4 max-w-lg">
        {/* Cover image */}
        <div>
          <label className="text-xs text-muted-foreground">תמונת נושא</label>
          <div className="mt-1 relative rounded-2xl overflow-hidden border h-36 bg-card flex items-center justify-center">
            {coverUrl ? (
              <>
                <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverUrl(null)}
                  className="absolute top-2 left-2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : uploading ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-1 text-muted-foreground text-sm"
              >
                <Camera className="size-6" />
                העלאת תמונה
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              value={coverUrlDraft}
              onChange={(e) => setCoverUrlDraft(e.target.value)}
              placeholder="או הדבק/י קישור לתמונה"
              dir="ltr"
              className="flex-1 h-10 rounded-xl bg-card border px-3 text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (coverUrlDraft.trim()) {
                  setCoverUrl(coverUrlDraft.trim());
                  setCoverUrlDraft("");
                }
              }}
              className="h-10 px-3 rounded-xl border text-xs font-medium"
            >
              הגדר
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">שם הטיול</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="יפן 2027"
            className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">מדינה</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="יפן"
              className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">ערים (לא חובה)</label>
            <input
              value={cities ?? ""}
              onChange={(e) => setCities(e.target.value)}
              placeholder="טוקיו, קיוטו"
              className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">תאריך התחלה</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              dir="ltr"
              className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">תאריך סיום</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              dir="ltr"
              className={cn(
                "w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none",
                endDate < startDate && "border-destructive",
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">תקציב</label>
            <input
              type="number"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="35000"
              dir="ltr"
              className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">מטבע התקציב</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full h-12 rounded-2xl bg-card border px-3 text-base outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="fixed bottom-20 md:bottom-6 left-0 right-0 px-5 md:px-0 md:max-w-lg md:mx-auto">
        <button
          onClick={submit}
          disabled={!valid || submitting}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          {submitting ? "שומר…" : existing ? "שמירת שינויים" : "יצירת טיול"}
        </button>
      </div>
    </AppShell>
  );
}
