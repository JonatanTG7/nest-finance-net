import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deriveTrackType,
  normalizePct,
  saveTrackAllocations,
  splitStatus,
  sumSplitPct,
  TRACK_TYPE_LABELS,
  TRACK_TYPES,
  type TrackAllocationInput,
  type TrackAllocationRow,
  type TrackType,
} from "@/lib/track-splits";

interface EditorRow {
  key: string;
  id?: string;
  track_name: string;
  track_code: string | null;
  track_type: TrackType;
  /** Set once the user picks a type by hand — then name edits stop re-deriving it. */
  typeManual: boolean;
  allocation_pct_balance: number | null;
  allocation_pct_deposits: number | null;
  return_year_pct: number | null;
}

function rowFromAllocation(a: TrackAllocationRow): EditorRow {
  return {
    key: a.id,
    id: a.id,
    track_name: a.track_name,
    track_code: a.track_code,
    track_type: (TRACK_TYPES.includes(a.track_type as TrackType)
      ? a.track_type
      : "general") as TrackType,
    typeManual: true,
    allocation_pct_balance: a.allocation_pct_balance,
    allocation_pct_deposits: a.allocation_pct_deposits,
    return_year_pct: a.return_year_pct,
  };
}

function newRow(): EditorRow {
  return {
    key: crypto.randomUUID(),
    track_name: "",
    track_code: null,
    track_type: "general",
    typeManual: false,
    allocation_pct_balance: null,
    allocation_pct_deposits: null,
    return_year_pct: null,
  };
}

/**
 * Edit a private account's track split: add/remove tracks, set each
 * track's share of the balance (and, optionally, a different share of
 * future deposits — the Migdal model). The live sum indicator warns
 * when a split is incomplete (allowed — the user may only know some
 * tracks) and blocks saving when a split exceeds 100% (always a
 * mistake). An empty percentage means "unknown", not zero.
 */
export function TrackSplitEditor({
  open,
  onOpenChange,
  accountId,
  accountName,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  initial: TrackAllocationRow[];
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [depositsEnabled, setDepositsEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(initial.map(rowFromAllocation));
    setDepositsEnabled(initial.some((a) => a.allocation_pct_deposits != null));
  }, [open, initial]);

  const patch = (key: string, p: Partial<EditorRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const balanceSum = useMemo(() => sumSplitPct(rows, "allocation_pct_balance"), [rows]);
  const depositsSum = useMemo(
    () => (depositsEnabled ? sumSplitPct(rows, "allocation_pct_deposits") : 0),
    [rows, depositsEnabled],
  );
  const balanceState = splitStatus(balanceSum);
  const depositsState = splitStatus(depositsSum);
  const allNamed = rows.every((r) => r.track_name.trim() !== "");
  const canSave =
    allNamed && balanceState !== "over" && (!depositsEnabled || depositsState !== "over");

  const save = useMutation({
    mutationFn: async () => {
      const inputs: TrackAllocationInput[] = rows.map((r) => ({
        id: r.id,
        track_name: r.track_name.trim(),
        track_code: r.track_code,
        track_type: r.track_type,
        allocation_pct_balance: r.allocation_pct_balance,
        allocation_pct_deposits: depositsEnabled ? r.allocation_pct_deposits : null,
        return_year_pct: r.return_year_pct,
      }));
      await saveTrackAllocations(accountId, inputs);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["track-allocations", accountId] });
      qc.invalidateQueries({ queryKey: ["track-allocations", "all"] });
      toast.success("פיצול המסלולים נשמר");
      onOpenChange(false);
    },
    onError: () => toast.error("לא הצלחנו לשמור את הפיצול"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>פיצול מסלולים — {accountName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              אין מסלולים עדיין. הוסף את המסלולים של החשבון ואת האחוז של כל אחד מהצבירה.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border bg-card p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="שם המסלול"
                  value={r.track_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    patch(r.key, {
                      track_name: name,
                      ...(r.typeManual ? {} : { track_type: deriveTrackType(name) }),
                    });
                  }}
                  maxLength={100}
                  placeholder="לדוגמה: מסלול מניות"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  aria-label={`מחק את ${r.track_name || "המסלול"}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted-foreground">
                  סוג מסלול
                  <select
                    aria-label="סוג מסלול"
                    value={r.track_type}
                    onChange={(e) =>
                      patch(r.key, { track_type: e.target.value as TrackType, typeManual: true })
                    }
                    className="w-full h-9 mt-1 border rounded-md bg-background px-2 text-sm text-foreground"
                  >
                    {TRACK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TRACK_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted-foreground">
                  תשואה שנתית (%)
                  <Input
                    aria-label="תשואה שנתית באחוזים"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={r.return_year_pct ?? ""}
                    onChange={(e) =>
                      patch(r.key, {
                        return_year_pct: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="—"
                    className="h-9 mt-1"
                  />
                </label>
              </div>
              <PctStepper
                label="מהצבירה"
                value={r.allocation_pct_balance}
                onChange={(v) => patch(r.key, { allocation_pct_balance: v })}
              />
              {depositsEnabled && (
                <PctStepper
                  label="מההפקדות"
                  value={r.allocation_pct_deposits}
                  onChange={(v) => patch(r.key, { allocation_pct_deposits: v })}
                />
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <Plus className="size-4" />
            הוסף מסלול
          </Button>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={depositsEnabled}
              onChange={(e) => setDepositsEnabled(e.target.checked)}
              className="size-4 accent-primary"
            />
            פיצול שונה להפקדות עתידיות
          </label>

          <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
            <SumLine label="סך צבירה" sum={balanceSum} state={balanceState} />
            {depositsEnabled && (
              <SumLine label="סך הפקדות" sum={depositsSum} state={depositsState} />
            )}
            <p className="text-xs text-muted-foreground pt-1">
              אחוז ריק פירושו "לא ידוע" — הוא יוצג כחלק לא מוקצה עד שתמלא אותו.
            </p>
          </div>

          {!allNamed && <p className="text-xs text-destructive">לכל מסלול צריך שם.</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!canSave || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "שומר…" : "שמור פיצול"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SumLine({
  label,
  sum,
  state,
}: {
  label: string;
  sum: number;
  state: "complete" | "under" | "over";
}) {
  return (
    <p className="flex items-center justify-between tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          state === "complete"
            ? "font-semibold text-emerald-600"
            : state === "over"
              ? "font-semibold text-red-600"
              : "font-semibold text-amber-600"
        }
      >
        {sum}%
        {state === "complete"
          ? " ✓"
          : state === "over"
            ? " — מעל 100%"
            : " — חסרים " + Math.round((100 - sum) * 10) / 10 + "%"}
      </span>
    </p>
  );
}

/** Percentage input with −/+ steppers (1% steps) and direct typing. */
function PctStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const step = (delta: number) => {
    const base = value ?? 0;
    onChange(normalizePct(base + delta));
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => step(-1)}
        aria-label="הפחת אחוז"
      >
        <Minus className="size-4" />
      </Button>
      <div className="relative flex-1">
        <Input
          aria-label={`אחוז ${label}`}
          type="number"
          min="0"
          max="100"
          step="0.1"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : normalizePct(Number(e.target.value)))
          }
          placeholder="—"
          className="h-9 text-center tabular-nums pe-7"
        />
        <span className="absolute start-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => step(1)}
        aria-label="הוסף אחוז"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
