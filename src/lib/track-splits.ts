import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";

export type TrackAllocationRow = Database["public"]["Tables"]["track_allocations"]["Row"];

/* ------------------------------------------------------------------ *
 * Track types — one stable categorical palette for the whole app.
 * The color follows the TYPE, never the account or the person, so the
 * same track type looks the same everywhere (donut, bar, legend).
 * ------------------------------------------------------------------ */

export const TRACK_TYPES = [
  "equities",
  "index",
  "bonds",
  "cash",
  "age-based",
  "halacha",
  "general",
] as const;
export type TrackType = (typeof TRACK_TYPES)[number];

export const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  equities: "מניות",
  index: "מחקה מדד",
  bonds: "אג״ח",
  cash: "כספי",
  "age-based": "לפי גיל",
  halacha: "הלכתי",
  general: "כללי",
};

/**
 * Fixed palette per track type (research: Empower-style categorical
 * colors). Green is the equities color here, matching the research
 * palette; red is never a track color — it is reserved for fee alerts
 * and losses.
 */
export const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  equities: "#16a34a",
  index: "#2563eb",
  bonds: "#d97706",
  cash: "#64748b",
  "age-based": "#8b5cf6",
  halacha: "#0d9488",
  general: "#94a3b8",
};

/** The "not allocated yet" remainder — a light neutral gray, never red. */
export const UNALLOCATED_COLOR = "#e2e8f0";

export function trackTypeColor(type: string): string {
  return TRACK_TYPE_COLORS[type as TrackType] ?? TRACK_TYPE_COLORS.general;
}

export function trackTypeLabel(type: string): string {
  return TRACK_TYPE_LABELS[type as TrackType] ?? TRACK_TYPE_LABELS.general;
}

/**
 * Guess a track's type from its Hebrew name, by keywords. Order
 * matters: an index tracker that mentions equities ("מסלול פסיבי-מדדי
 * מניות") is an index track, and an age band ("לבני 50 ומטה") wins
 * over anything else it mentions. Unknown names are "general".
 */
export function deriveTrackType(name: string): TrackType {
  const n = name.toLowerCase();
  if (n.includes("הלכ")) return "halacha";
  if (
    n.includes("מדד") ||
    n.includes("s&p") ||
    n.includes("מחקה") ||
    n.includes("msci") ||
    n.includes("נאסד")
  ) {
    return "index";
  }
  if (
    n.includes("לבני") ||
    n.includes("בני 50") ||
    n.includes("בני 60") ||
    n.includes("50 ומטה") ||
    n.includes("60 ומעלה") ||
    n.includes("גיל") ||
    n.includes("יעד")
  ) {
    return "age-based";
  }
  if (n.includes("אג") || n.includes("סולידי")) return "bonds";
  if (n.includes("כספי") || n.includes("מזומן") || n.includes("שקלי") || n.includes("פקדון")) {
    return "cash";
  }
  if (n.includes("מניות") || n.includes("מנייתי")) return "equities";
  return "general";
}

/* ------------------------------------------------------------------ *
 * Pure split rules — percentages are stored with one decimal.
 * ------------------------------------------------------------------ */

/** A track row as edited in the UI (id present for existing rows). */
export interface TrackAllocationInput {
  id?: string;
  track_name: string;
  track_code?: string | null;
  track_type: TrackType;
  allocation_pct_balance: number | null;
  allocation_pct_deposits: number | null;
  return_year_pct?: number | null;
}

/** Round to one decimal and clamp into 0–100; null stays null. */
export function normalizePct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/** Sum of the set percentages for one split (nulls count as 0). */
export function sumSplitPct(
  allocations: { allocation_pct_balance: number | null; allocation_pct_deposits: number | null }[],
  field: "allocation_pct_balance" | "allocation_pct_deposits",
): number {
  const sum = allocations.reduce((s, a) => s + (a[field] ?? 0), 0);
  return Math.round(sum * 10) / 10;
}

/** The remainder nobody assigned yet (100 − sum), or 0 when fully split. */
export function unallocatedPct(
  allocations: { allocation_pct_balance: number | null; allocation_pct_deposits: number | null }[],
  field: "allocation_pct_balance" | "allocation_pct_deposits",
): number {
  return Math.max(0, Math.round((100 - sumSplitPct(allocations, field)) * 10) / 10);
}

export type SplitStatus = "complete" | "under" | "over";

/**
 * Whether a split adds up: complete at exactly 100, under below it,
 * over above it. A split is never hard-blocked for being incomplete —
 * the user may only know some of the tracks — but "over" is always a
 * mistake worth flagging loudly.
 */
export function splitStatus(sum: number): SplitStatus {
  const r = Math.round(sum * 10) / 10;
  if (r > 100) return "over";
  if (r < 100) return "under";
  return "complete";
}

/** Amount in a track, derived from % × balance, rounded to whole ₪. */
export function balanceInTrack(balanceIls: number, pct: number | null): number {
  if (pct == null || !Number.isFinite(balanceIls)) return 0;
  return Math.round((balanceIls * pct) / 100);
}

export interface SplitSegment {
  id: string;
  name: string;
  pct: number;
  amountIls: number;
  color: string;
  returnYearPct: number | null;
  depositsPct: number | null;
  isUnallocated: boolean;
}

/**
 * Chart segments for the balance split: one per track with a set
 * percentage > 0, largest first, plus a gray "unallocated" remainder
 * when the split does not reach 100. Tracks without a percentage (e.g.
 * imported from a statement, which never lists them) fold into the
 * remainder — their share is unknown, not zero.
 */
export function buildSplitSegments(
  allocations: TrackAllocationRow[],
  balanceIls: number,
): SplitSegment[] {
  const withPct = allocations
    .filter((a) => (a.allocation_pct_balance ?? 0) > 0)
    .map((a) => ({
      id: a.id,
      name: a.track_name,
      pct: a.allocation_pct_balance ?? 0,
      amountIls: balanceInTrack(balanceIls, a.allocation_pct_balance),
      color: trackTypeColor(a.track_type),
      returnYearPct: a.return_year_pct,
      depositsPct: a.allocation_pct_deposits,
      isUnallocated: false,
    }))
    .sort((x, y) => y.pct - x.pct);
  const remainder = unallocatedPct(allocations, "allocation_pct_balance");
  if (remainder > 0 && allocations.length > 0) {
    withPct.push({
      id: "unallocated",
      name: "לא מוקצה",
      pct: remainder,
      amountIls: balanceInTrack(balanceIls, remainder),
      color: UNALLOCATED_COLOR,
      returnYearPct: null,
      depositsPct: null,
      isUnallocated: true,
    });
  }
  return withPct;
}

/* ------------------------------------------------------------------ *
 * Import merge — statement tracks (names + returns, never %) folded
 * into the account's existing tracks, matched by normalized name.
 * ------------------------------------------------------------------ */

export interface ImportedTrack {
  name: string;
  returnYearPct: number | null;
}

function normalizeTrackName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Merge tracks read from a statement into the existing allocations:
 * a track whose name already exists keeps its percentages and gets
 * its annual return refreshed; a new name is added with NO percentage
 * (the statement has none — the user fills it in). Tracks missing
 * from the import are kept untouched: a partial scan must never
 * delete what the user already entered.
 */
export function mergeImportedTracks(
  existing: TrackAllocationRow[],
  imported: ImportedTrack[],
): { toSave: TrackAllocationInput[]; added: number; updated: number } {
  const byName = new Map<string, TrackAllocationRow>();
  for (const a of existing) byName.set(normalizeTrackName(a.track_name), a);

  const toSave: TrackAllocationInput[] = existing.map((a) => ({
    id: a.id,
    track_name: a.track_name,
    track_code: a.track_code,
    track_type: (TRACK_TYPES.includes(a.track_type as TrackType)
      ? a.track_type
      : "general") as TrackType,
    allocation_pct_balance: a.allocation_pct_balance,
    allocation_pct_deposits: a.allocation_pct_deposits,
    return_year_pct: a.return_year_pct,
  }));
  const addedKeys = new Set<string>();
  let added = 0;
  let updated = 0;
  for (const t of imported) {
    const key = normalizeTrackName(t.name);
    if (!key) continue;
    const match = byName.get(key);
    if (match) {
      const row = toSave.find((r) => r.id === match.id);
      if (row && t.returnYearPct != null && row.return_year_pct !== t.returnYearPct) {
        row.return_year_pct = t.returnYearPct;
        updated += 1;
      }
    } else if (!addedKeys.has(key)) {
      addedKeys.add(key);
      toSave.push({
        track_name: t.name.trim(),
        track_code: null,
        track_type: deriveTrackType(t.name),
        allocation_pct_balance: null,
        allocation_pct_deposits: null,
        return_year_pct: t.returnYearPct,
      });
      added += 1;
    }
  }
  return { toSave, added, updated };
}

/* ------------------------------------------------------------------ *
 * Data access
 * ------------------------------------------------------------------ */

export async function fetchTrackAllocations(accountId: string): Promise<TrackAllocationRow[]> {
  const { data, error } = await supabase
    .from("track_allocations")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** All of the household's track allocations (RLS-scoped), for the slim bars on the person page. */
export async function fetchAllTrackAllocations(): Promise<TrackAllocationRow[]> {
  const { data, error } = await supabase
    .from("track_allocations")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Replace an account's track list with a new one. Upsert first (new
 * rows get fresh ids client-side), then delete rows that are no
 * longer in the list — so a failed save never leaves the account
 * with fewer tracks than it started with.
 */
export async function saveTrackAllocations(
  accountId: string,
  inputs: TrackAllocationInput[],
): Promise<void> {
  const household_id = await getMyHouseholdId();
  const cleaned = inputs
    .map((t, i) => ({
      id: t.id ?? crypto.randomUUID(),
      household_id,
      investment_account_id: accountId,
      track_name: t.track_name.trim(),
      track_code: (t.track_code ?? "").trim() || null,
      track_type: t.track_type,
      allocation_pct_balance: normalizePct(t.allocation_pct_balance),
      allocation_pct_deposits: normalizePct(t.allocation_pct_deposits),
      return_year_pct: t.return_year_pct ?? null,
      sort_order: i,
    }))
    .filter((t) => t.track_name !== "");
  const ids = cleaned.map((t) => t.id);
  const { error: upsertError } = await supabase
    .from("track_allocations")
    .upsert(cleaned, { onConflict: "id" });
  if (upsertError) throw upsertError;
  // Delete rows the user removed. When the new list is empty this
  // removes every track of the account.
  let del = supabase.from("track_allocations").delete().eq("investment_account_id", accountId);
  if (ids.length > 0) del = del.not("id", "in", `(${ids.join(",")})`);
  const { error: deleteError } = await del;
  if (deleteError) throw deleteError;
}
