import {
  deriveTrackType,
  splitStatus,
  sumSplitPct,
  trackTypeColor,
  unallocatedPct,
  TRACK_TYPES,
  type TrackAllocationInput,
  type TrackAllocationRow,
  type TrackType,
} from "./track-splits";

/* ------------------------------------------------------------------ *
 * Preset tracks — the common Israeli pension / study-fund tracks, as
 * tappable chips. Each preset carries its type explicitly (and the
 * tests pin the invariant that it matches deriveTrackType of the
 * name, so a preset renamed in one place cannot drift from the other).
 * ------------------------------------------------------------------ */

export interface TrackPreset {
  name: string;
  type: TrackType;
}

export const TRACK_PRESETS: TrackPreset[] = [
  { name: "מניות", type: "equities" },
  { name: "מחקה S&P 500", type: "index" },
  { name: "מחקה מדדים", type: "index" },
  { name: "אג״ח ממשלתי", type: "bonds" },
  { name: "אג״ח קונצרני", type: "bonds" },
  { name: "מסלול לפי גיל", type: "age-based" },
  { name: "הלכה", type: "halacha" },
  { name: "כספי", type: "cash" },
  { name: "מניות חו״ל", type: "equities" },
];

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The preset whose name matches (case/space-insensitive), if any. */
export function presetForName(name: string): TrackPreset | null {
  const key = normalizeName(name);
  if (!key) return null;
  return TRACK_PRESETS.find((p) => normalizeName(p.name) === key) ?? null;
}

/* ------------------------------------------------------------------ *
 * Picker rows — the shared editing state for the track picker, used
 * both by the account dialog (create/edit) and the track-split editor.
 * ------------------------------------------------------------------ */

export interface PickerRow {
  key: string;
  id?: string;
  /**
   * The preset this row came from (null for custom/imported rows).
   * Cleared when the user renames the row away from the preset name,
   * so the chip stops showing as picked and tapping it adds a fresh row.
   */
  presetName: string | null;
  track_name: string;
  track_code: string | null;
  track_type: TrackType;
  /** Set once the type is fixed by a preset or picked by hand — then name edits stop re-deriving it. */
  typeManual: boolean;
  allocation_pct_balance: number | null;
  allocation_pct_deposits: number | null;
  return_year_pct: number | null;
}

export function rowFromAllocation(a: TrackAllocationRow): PickerRow {
  const preset = presetForName(a.track_name);
  return {
    key: a.id,
    id: a.id,
    presetName: preset?.name ?? null,
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

/** A row tapped from a preset chip: name + type fixed by the preset, no percentage yet. */
export function rowFromPreset(preset: TrackPreset): PickerRow {
  return {
    key: crypto.randomUUID(),
    presetName: preset.name,
    track_name: preset.name,
    track_code: null,
    track_type: preset.type,
    typeManual: true,
    allocation_pct_balance: null,
    allocation_pct_deposits: null,
    return_year_pct: null,
  };
}

/** A custom (free-text) row: the type is derived from the name until the user picks one by hand. */
export function newCustomRow(name: string): PickerRow {
  const trimmed = name.trim();
  return {
    key: crypto.randomUUID(),
    presetName: null,
    track_name: trimmed,
    track_code: null,
    track_type: deriveTrackType(trimmed),
    typeManual: false,
    allocation_pct_balance: null,
    allocation_pct_deposits: null,
    return_year_pct: null,
  };
}

/** Is this preset currently picked (a row still carries its name)? */
export function isPresetPicked(rows: PickerRow[], preset: TrackPreset): boolean {
  return rows.some((r) => r.presetName === preset.name);
}

/** Tap a preset chip: remove its row when picked, add one when not. */
export function togglePreset(rows: PickerRow[], preset: TrackPreset): PickerRow[] {
  if (isPresetPicked(rows, preset)) {
    return rows.filter((r) => r.presetName !== preset.name);
  }
  return [...rows, rowFromPreset(preset)];
}

/** Does a row with this name already exist (so adding it again would duplicate)? */
export function hasTrackNamed(rows: PickerRow[], name: string): boolean {
  const key = normalizeName(name);
  return key !== "" && rows.some((r) => normalizeName(r.track_name) === key);
}

export function patchRow(rows: PickerRow[], key: string, patch: Partial<PickerRow>): PickerRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

export function removeRow(rows: PickerRow[], key: string): PickerRow[] {
  return rows.filter((r) => r.key !== key);
}

/**
 * Rename a row: the preset link follows the new name — dropped when
 * it no longer matches a preset, (re-)linked when it does — and, for
 * rows whose type was never fixed, the type is re-derived from the
 * new name.
 */
export function renameRow(rows: PickerRow[], key: string, name: string): PickerRow[] {
  return rows.map((r) => {
    if (r.key !== key) return r;
    return {
      ...r,
      track_name: name,
      presetName: presetForName(name)?.name ?? null,
      ...(r.typeManual ? {} : { track_type: deriveTrackType(name) }),
    };
  });
}

/**
 * Rows → save inputs. The deposits mode is explicit on purpose: a
 * caller that does not edit the deposits split (the account dialog
 * is balance-only) must use "keep", so a deposits split set in the
 * editor survives an edit save. Only the editor passes "clear", when
 * the user turns the deposits split off.
 */
export function rowsToInputs(
  rows: PickerRow[],
  deposits: "keep" | "clear",
): TrackAllocationInput[] {
  return rows.map((r) => ({
    id: r.id,
    track_name: r.track_name.trim(),
    track_code: r.track_code,
    track_type: r.track_type,
    allocation_pct_balance: r.allocation_pct_balance,
    allocation_pct_deposits: deposits === "keep" ? r.allocation_pct_deposits : null,
    return_year_pct: r.return_year_pct,
  }));
}

/**
 * Whether the split can be saved: every row named, and no split over
 * 100%. Under 100% is allowed — the user may only know some tracks —
 * but over is always a mistake.
 */
export function splitCanSave(rows: PickerRow[], depositsEnabled: boolean): boolean {
  const allNamed = rows.every((r) => r.track_name.trim() !== "");
  const balanceOk = splitStatus(sumSplitPct(rows, "allocation_pct_balance")) !== "over";
  const depositsOk =
    !depositsEnabled || splitStatus(sumSplitPct(rows, "allocation_pct_deposits")) !== "over";
  return allNamed && balanceOk && depositsOk;
}

export interface SplitBarSegment {
  key: string;
  name: string;
  pct: number;
  color: string;
  isUnallocated: boolean;
}

/**
 * Segments for the picker's live split bar: one per track with a set
 * percentage > 0, largest first, plus a gray "unallocated" remainder
 * when the split does not reach 100. Tracks without a percentage fold
 * into the remainder — their share is unknown, not zero.
 */
export function splitBarSegments(rows: PickerRow[]): SplitBarSegment[] {
  const segments = rows
    .filter((r) => (r.allocation_pct_balance ?? 0) > 0)
    .map((r) => ({
      key: r.key,
      name: r.track_name,
      pct: r.allocation_pct_balance ?? 0,
      color: trackTypeColor(r.track_type),
      isUnallocated: false,
    }))
    .sort((x, y) => y.pct - x.pct);
  const remainder = unallocatedPct(rows, "allocation_pct_balance");
  if (remainder > 0 && rows.length > 0) {
    segments.push({
      key: "unallocated",
      name: "לא מוקצה",
      pct: remainder,
      color: "#e2e8f0",
      isUnallocated: true,
    });
  }
  return segments;
}
