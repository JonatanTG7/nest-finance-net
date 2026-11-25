import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";
import {
  logPrivateAccountChanges,
  type DetailGroup,
  type PrivateAccountChange,
} from "@/lib/private-accounts";

export type CustomFieldRow = Database["public"]["Tables"]["account_custom_fields"]["Row"];

/* ------------------------------------------------------------------ *
 * Details-list arrangement — one rule for every place the account
 * details list renders: empty fields are skipped, hidden fixed rows
 * are skipped, and meta rows (owner, data source — associations, not
 * account data) always render last, below the account data. Custom
 * fields are account data: they render with the account block.
 * ------------------------------------------------------------------ */

/** One row of the details list, fixed or custom. */
export interface DetailFieldDef {
  /** Stable key: a fixed-field key, or `custom:<uuid>` for custom fields. */
  key: string;
  label: string;
  value: string | null;
  ltr?: boolean;
  group: DetailGroup;
}

/**
 * Arrange detail rows for display: drop rows with no value and rows the
 * owner hid, then split into the account block (first) and the meta
 * block (last). Input order is kept inside each block.
 */
export function arrangeDetailFields(
  fields: DetailFieldDef[],
  hiddenKeys: string[],
): { account: DetailFieldDef[]; meta: DetailFieldDef[] } {
  const visible = fields.filter((f) => f.value != null && !hiddenKeys.includes(f.key));
  return {
    account: visible.filter((f) => f.group === "account"),
    meta: visible.filter((f) => f.group === "meta"),
  };
}

/* ------------------------------------------------------------------ *
 * Custom fields — free-text label + value rows the owner adds to an
 * account. Stored in their own table (like track_allocations); a row
 * with an empty label or value is dropped on save, never stored.
 * ------------------------------------------------------------------ */

/** A custom field as edited in the UI (id present for existing rows). */
export interface CustomFieldInput {
  id?: string;
  label: string;
  value: string;
}

export const MAX_CUSTOM_FIELD_LABEL = 50;
export const MAX_CUSTOM_FIELD_VALUE = 200;

function textValue(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Normalize editor rows into storable inputs: trim label/value, drop
 * rows missing either one. An empty row is "not filled in yet", not an
 * error — the editor just doesn't save it.
 */
export function normalizeCustomFieldInputs(rows: CustomFieldInput[]): CustomFieldInput[] {
  const out: CustomFieldInput[] = [];
  for (const r of rows) {
    const label = textValue(r.label);
    const value = textValue(r.value);
    if (label == null || value == null) continue;
    out.push({
      ...(r.id ? { id: r.id } : {}),
      label: label.slice(0, MAX_CUSTOM_FIELD_LABEL),
      value: value.slice(0, MAX_CUSTOM_FIELD_VALUE),
    });
  }
  return out;
}

/**
 * Whether the editor's rows can save: no row may have exactly one of
 * label/value filled (a half-filled row is a mistake — fill both or
 * leave the row empty and it is dropped).
 */
export function customFieldsCanSave(rows: CustomFieldInput[]): boolean {
  return rows.every((r) => {
    const hasLabel = textValue(r.label) != null;
    const hasValue = textValue(r.value) != null;
    return hasLabel === hasValue;
  });
}

function fieldDisplay(label: string, value: string): string {
  return `${label}: ${value}`;
}

/**
 * Diff old stored rows vs new normalized inputs — one history change
 * per added, removed or changed field, as "label: value" strings.
 * Matched by id; a row without an id is new.
 */
export function diffCustomFields(
  oldRows: CustomFieldRow[],
  newInputs: CustomFieldInput[],
): PrivateAccountChange[] {
  const changes: PrivateAccountChange[] = [];
  const byId = new Map(oldRows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const n of newInputs) {
    if (n.id == null) {
      changes.push({
        field: "custom_field",
        oldValue: null,
        newValue: fieldDisplay(n.label, n.value),
      });
      continue;
    }
    seen.add(n.id);
    const old = byId.get(n.id);
    if (!old) {
      changes.push({
        field: "custom_field",
        oldValue: null,
        newValue: fieldDisplay(n.label, n.value),
      });
      continue;
    }
    const oldDisplay = fieldDisplay(old.label, old.value);
    const newDisplay = fieldDisplay(n.label, n.value);
    if (oldDisplay !== newDisplay) {
      changes.push({ field: "custom_field", oldValue: oldDisplay, newValue: newDisplay });
    }
  }
  for (const old of oldRows) {
    if (!seen.has(old.id)) {
      changes.push({
        field: "custom_field",
        oldValue: fieldDisplay(old.label, old.value),
        newValue: null,
      });
    }
  }
  return changes;
}

/* ------------------------------------------------------------------ *
 * Data access
 * ------------------------------------------------------------------ */

export async function fetchCustomFields(accountId: string): Promise<CustomFieldRow[]> {
  const { data, error } = await supabase
    .from("account_custom_fields")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Replace an account's custom fields with a new list, and record the
 * added/removed/changed fields in the metadata history — same pattern
 * as saveTrackAllocations (upsert first, then delete the removed rows,
 * so a failed save never leaves fewer fields than before). The history
 * write is best-effort: if it fails, the save itself already succeeded.
 */
export async function saveCustomFields(
  accountId: string,
  oldRows: CustomFieldRow[],
  inputs: CustomFieldInput[],
): Promise<void> {
  const household_id = await getMyHouseholdId();
  const cleaned = normalizeCustomFieldInputs(inputs).map((f, i) => ({
    id: f.id ?? crypto.randomUUID(),
    household_id,
    investment_account_id: accountId,
    label: f.label,
    value: f.value,
    sort_order: i,
  }));
  const changes = diffCustomFields(oldRows, cleaned);
  const ids = cleaned.map((f) => f.id);
  const { error: upsertError } = await supabase
    .from("account_custom_fields")
    .upsert(cleaned, { onConflict: "id" });
  if (upsertError) throw upsertError;
  let del = supabase.from("account_custom_fields").delete().eq("investment_account_id", accountId);
  if (ids.length > 0) del = del.not("id", "in", `(${ids.join(",")})`);
  const { error: deleteError } = await del;
  if (deleteError) throw deleteError;
  try {
    await logPrivateAccountChanges(accountId, changes);
  } catch (e) {
    console.error("logPrivateAccountChanges failed (custom fields already saved)", e);
  }
}
