import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { parseExpenseCsv, type CsvExpenseRow } from "@/lib/csv-import";
import { createTransaction, fetchCategories } from "@/lib/db";
import { fetchRateToIls } from "@/lib/fx";
import { getDefaultPerson, useMemberLabels, type Person } from "@/lib/person";
import { cn } from "@/lib/utils";

export function TripCsvImport({ tripId, tripCurrency }: { tripId: string; tripCurrency: string }) {
  const qc = useQueryClient();
  const labels = useMemberLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<(CsvExpenseRow & { on: boolean })[] | null>(null);
  const [person, setPerson] = useState<Person>(getDefaultPerson());
  const [categoryId, setCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const expenseCats = categories.filter((c) => c.type === "expense");

  async function onFile(f: File | undefined) {
    if (!f) return;
    const parsed = parseExpenseCsv(await f.text());
    if (parsed.length === 0) {
      toast.error("לא נמצאו שורות עם תאריך וסכום בקובץ");
      return;
    }
    setRows(parsed.map((r) => ({ ...r, currency: r.currency ?? tripCurrency, on: true })));
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.on);
    setSaving(true);
    try {
      const rates = new Map<string, number>();
      for (const c of new Set(chosen.map((r) => r.currency!))) rates.set(c, await fetchRateToIls(c));
      for (const r of chosen) {
        await createTransaction({
          type: "expense",
          amount: r.amount,
          currency: r.currency!,
          fx_rate_to_ils: rates.get(r.currency!)!,
          category_id: categoryId || null,
          title: r.title,
          note: "יובא מ-CSV",
          occurred_at: r.date,
          entered_by: person,
          tag_names: [],
          trip_id: tripId,
        });
      }
      await qc.invalidateQueries({ queryKey: ["trip", tripId] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`נוספו ${chosen.length} הוצאות לטיול`);
      setRows(null);
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  const count = rows?.filter((r) => r.on).length ?? 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <FileUp className="size-4" /> ייבוא מ-CSV
      </Button>

      <Dialog open={!!rows} onOpenChange={(o) => !o && setRows(null)}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>ייבוא הוצאות לטיול</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">מי שילם</p>
              <div className="flex gap-2">
                {(["yonatan", "shiri", "shared"] as Person[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPerson(p)}
                    className={cn(
                      "flex-1 rounded-lg border py-1.5 text-sm",
                      person === p && "bg-primary text-primary-foreground border-primary",
                    )}
                  >
                    {labels[p]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">קטגוריה לכל השורות</p>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="">ללא קטגוריה</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji ?? ""} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto rounded-xl border divide-y">
            {rows?.map((r, i) => (
              <label key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  checked={r.on}
                  onCheckedChange={(v) =>
                    setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, on: !!v } : x)))
                  }
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                <span className="tabular-nums" dir="ltr">
                  {r.amount.toLocaleString()} {r.currency}
                </span>
              </label>
            ))}
          </div>
          <Button onClick={save} disabled={saving || count === 0}>
            {saving ? "שומר…" : `הוסף ${count} הוצאות לטיול`}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
