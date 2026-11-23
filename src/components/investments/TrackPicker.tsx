import { useMemo, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizePct,
  splitStatus,
  sumSplitPct,
  TRACK_TYPE_LABELS,
  TRACK_TYPES,
  trackTypeColor,
  trackTypeLabel,
  type TrackType,
} from "@/lib/track-splits";
import {
  hasTrackNamed,
  isPresetPicked,
  newCustomRow,
  patchRow,
  removeRow,
  renameRow,
  splitBarSegments,
  togglePreset,
  TRACK_PRESETS,
  type PickerRow,
} from "@/lib/track-picker";
import { maskAmountText } from "@/lib/privacy";

interface TrackPickerProps {
  rows: PickerRow[];
  onChange: (rows: PickerRow[]) => void;
  /** A different split for future deposits (the Migdal model). */
  depositsEnabled: boolean;
  onDepositsEnabledChange: (enabled: boolean) => void;
  /** Show the deposits-split toggle + deposits steppers (the editor; the dialog keeps it simple). */
  showDepositsToggle?: boolean;
  /** Show the annual-return input per track (the editor; the dialog skips it). */
  showReturn?: boolean;
  /** Privacy mode: mask percentages in the summary lines. */
  hidden?: boolean;
}

/**
 * Pick a private account's tracks: tap preset chips of the common
 * Israeli pension / study-fund tracks, or add a custom one by name.
 * Each picked track gets a % of the balance (stepper ±1% or direct
 * typing, one decimal), a live segmented split bar, and a sum
 * indicator — under 100% is allowed (partial knowledge), over 100%
 * is blocked by the parent's save button. An empty % means "unknown",
 * never zero. Preset rows carry their type; custom rows get a type
 * select (auto-derived from the name until picked by hand).
 */
export function TrackPicker({
  rows,
  onChange,
  depositsEnabled,
  onDepositsEnabledChange,
  showDepositsToggle = false,
  showReturn = false,
  hidden = false,
}: TrackPickerProps) {
  const [customName, setCustomName] = useState("");

  const balanceSum = useMemo(() => sumSplitPct(rows, "allocation_pct_balance"), [rows]);
  const depositsSum = useMemo(
    () => (depositsEnabled ? sumSplitPct(rows, "allocation_pct_deposits") : 0),
    [rows, depositsEnabled],
  );
  const balanceState = splitStatus(balanceSum);
  const depositsState = splitStatus(depositsSum);
  const segments = useMemo(() => splitBarSegments(rows), [rows]);

  const customDuplicate = hasTrackNamed(rows, customName);
  const canAddCustom = customName.trim() !== "" && !customDuplicate;
  const addCustom = () => {
    if (!canAddCustom) return;
    onChange([...rows, newCustomRow(customName)]);
    setCustomName("");
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">פיצול מסלולים</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          בחר את המסלולים של החשבון ואת האחוז של כל אחד מהצבירה — למשל 20% מניות ו־80% מחקה S&amp;P
          500.
        </p>
      </div>

      {/* Preset chips — tap to add, tap again to remove. */}
      <div className="flex flex-wrap gap-2">
        {TRACK_PRESETS.map((preset) => {
          const picked = isPresetPicked(rows, preset);
          const color = trackTypeColor(preset.type);
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => onChange(togglePreset(rows, preset))}
              aria-pressed={picked}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                picked ? "font-semibold" : "bg-card hover:bg-accent"
              }`}
              style={
                picked
                  ? { borderColor: color, background: `${color}1f`, color }
                  : { borderColor: "var(--border)" }
              }
            >
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ background: color }}
                aria-hidden
              />
              {preset.name}
              {picked && <Check className="size-3.5" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* Custom track by name. */}
      <div className="flex gap-2">
        <Input
          aria-label="מסלול אחר"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          maxLength={100}
          placeholder="מסלול אחר…"
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={addCustom} disabled={!canAddCustom}>
          <Plus className="size-4" />
          הוסף
        </Button>
      </div>
      {customDuplicate && <p className="text-xs text-muted-foreground">המסלול הזה כבר ברשימה.</p>}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-1">
          אין מסלולים עדיין — אפשר גם להשאיר ריק ולמלא אחר כך.
        </p>
      )}

      {rows.map((r) => {
        const isPreset = r.presetName != null;
        return (
          <div key={r.key} className="rounded-xl border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label="שם המסלול"
                value={r.track_name}
                onChange={(e) => onChange(renameRow(rows, r.key, e.target.value))}
                maxLength={100}
                placeholder="לדוגמה: מסלול מניות"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive"
                onClick={() => onChange(removeRow(rows, r.key))}
                aria-label={`מחק את ${r.track_name || "המסלול"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {isPreset ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs shrink-0"
                  style={{
                    background: `${trackTypeColor(r.track_type)}1f`,
                    color: trackTypeColor(r.track_type),
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: trackTypeColor(r.track_type) }}
                    aria-hidden
                  />
                  {trackTypeLabel(r.track_type)}
                </span>
              ) : (
                <label className="block text-xs text-muted-foreground flex-1">
                  סוג מסלול
                  <select
                    aria-label="סוג מסלול"
                    value={r.track_type}
                    onChange={(e) =>
                      onChange(
                        patchRow(rows, r.key, {
                          track_type: e.target.value as TrackType,
                          typeManual: true,
                        }),
                      )
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
              )}
              {showReturn && (
                <label className="block text-xs text-muted-foreground flex-1">
                  תשואה שנתית (%)
                  <Input
                    aria-label="תשואה שנתית באחוזים"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={r.return_year_pct ?? ""}
                    onChange={(e) =>
                      onChange(
                        patchRow(rows, r.key, {
                          return_year_pct: e.target.value === "" ? null : Number(e.target.value),
                        }),
                      )
                    }
                    placeholder="—"
                    className="h-9 mt-1"
                  />
                </label>
              )}
            </div>
            <PctStepper
              label="מהצבירה"
              value={r.allocation_pct_balance}
              onChange={(v) => onChange(patchRow(rows, r.key, { allocation_pct_balance: v }))}
            />
            {depositsEnabled && (
              <PctStepper
                label="מההפקדות"
                value={r.allocation_pct_deposits}
                onChange={(v) => onChange(patchRow(rows, r.key, { allocation_pct_deposits: v }))}
              />
            )}
          </div>
        );
      })}

      {showDepositsToggle && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={depositsEnabled}
            onChange={(e) => onDepositsEnabledChange(e.target.checked)}
            className="size-4 accent-primary"
          />
          פיצול שונה להפקדות עתידיות
        </label>
      )}

      {rows.length > 0 && (
        <>
          {/* Live segmented split bar — the same split, at a glance. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full" dir="ltr">
            {segments.map((s) => (
              <div
                key={s.key}
                style={{ width: `${s.pct}%`, background: s.color }}
                title={`${s.name}: ${s.pct}%`}
              />
            ))}
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
            <SumLine label="סך צבירה" sum={balanceSum} state={balanceState} hidden={hidden} />
            {depositsEnabled && (
              <SumLine label="סך הפקדות" sum={depositsSum} state={depositsState} hidden={hidden} />
            )}
            <p className="text-xs text-muted-foreground pt-1">
              אחוז ריק פירושו "לא ידוע" — הוא יוצג כחלק לא מוקצה עד שתמלא אותו.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SumLine({
  label,
  sum,
  state,
  hidden,
}: {
  label: string;
  sum: number;
  state: "complete" | "under" | "over";
  hidden: boolean;
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
        {maskAmountText(`${sum}%`, hidden)}
        {state === "complete"
          ? " ✓"
          : state === "over"
            ? " — מעל 100%"
            : ` — חסרים ${maskAmountText(`${Math.round((100 - sum) * 10) / 10}%`, hidden)}`}
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
