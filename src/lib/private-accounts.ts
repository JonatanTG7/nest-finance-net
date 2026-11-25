import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId, fetchMyProfile } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import { SHARED_OWNER, type OwnerId } from "@/lib/person";
import { IB_KIND } from "@/lib/ib";
import { statementAccountColumns, type StatementFields } from "@/lib/statement-rules";
import type { InvestmentAccount } from "@/lib/db";

export type PrivateAccountHistoryRow =
  Database["public"]["Tables"]["private_account_history"]["Row"];

/* ------------------------------------------------------------------ *
 * Labels & colors — the single place for private-account metadata.
 * No member names live here: person labels come from useMemberLabels().
 * ------------------------------------------------------------------ */

/** Metadata fields tracked in the history table. */
export type PrivateAccountField =
  | "company"
  | "fee_from_balance"
  | "fee_from_deposits"
  | "track"
  | "name"
  | "kind"
  | "owner"
  | "color"
  | "custom_field"
  | "hidden_fields";

export const PRIVATE_FIELD_LABELS: Record<PrivateAccountField, string> = {
  company: "חברה",
  fee_from_balance: "דמי ניהול מצבירה",
  fee_from_deposits: "דמי ניהול מהפקדות",
  track: "מסלול",
  name: "שם",
  kind: "סוג חשבון",
  owner: "בעלים",
  color: "צבע",
  custom_field: "שדה נוסף",
  hidden_fields: "הסתרת שדה",
};

/**
 * The fixed rows of the account-details list, in canonical order.
 * `group` decides the render order on the account page: account data
 * first, associations/meta that aren't really account data (owner,
 * data source) always last. Custom fields are account data too — they
 * render with the account block, above the meta block. The `key` is
 * the stable id stored in hidden_detail_fields when a row is hidden.
 */
export type DetailGroup = "account" | "meta";

export interface FixedDetailField {
  key: string;
  label: string;
  group: DetailGroup;
}

export const FIXED_DETAIL_FIELDS: FixedDetailField[] = [
  { key: "kind", label: "סוג חשבון", group: "account" },
  { key: "company", label: "חברה מנהלת", group: "account" },
  { key: "fee_from_balance", label: "דמי ניהול מצבירה", group: "account" },
  { key: "fee_from_deposits", label: "דמי ניהול מהפקדות", group: "account" },
  { key: "track", label: "מסלול", group: "account" },
  { key: "expected_monthly_pension", label: "קצבה חודשית צפויה", group: "account" },
  { key: "monthly_deposit", label: "הפקדה חודשית", group: "account" },
  { key: "treasury_code", label: "קוד האוצר", group: "account" },
  { key: "data_source", label: "מקור הנתונים", group: "meta" },
  { key: "owner", label: "בעלים", group: "meta" },
];

/** Hebrew label of a fixed detail row, by its stable key. */
export function fixedDetailFieldLabel(key: string): string {
  return FIXED_DETAIL_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/** Account types offered for private accounts. */
export const PRIVATE_ACCOUNT_KINDS = ["pension", "provident", "savings", "investment"] as const;
export type PrivateAccountKind = (typeof PRIVATE_ACCOUNT_KINDS)[number];

export const PRIVATE_KIND_LABELS: Record<string, string> = {
  pension: "קרן פנסיה",
  provident: "קופת גמל / השתלמות",
  savings: "חיסכון",
  investment: "השקעה",
  interactive: "Interactive Brokers",
  other: "אחר",
};

/** Colorful accent per account type (card dot + header tint). */
export const PRIVATE_KIND_COLORS: Record<string, string> = {
  pension: "#8b5cf6",
  provident: "#10b981",
  savings: "#f59e0b",
  investment: "#3b82f6",
  other: "#64748b",
};

export function kindLabel(kind: string): string {
  return PRIVATE_KIND_LABELS[kind] ?? kind;
}

/**
 * Fee percentage for display: an unset half is 0% — a fee that was never
 * entered is 0, not "unknown". The card's fee line shows both halves
 * whenever at least one of them is set.
 */
export function formatFeePercent(fee: number | null | undefined): string {
  return `${fee ?? 0}%`;
}

/**
 * One history value for display: a cleared/never-set value shows nothing
 * (no "—" placeholder). Owner ids resolve through the member labels,
 * kinds through kindLabel, fees get a % suffix.
 */
export function displayHistoryValue(
  field: string,
  value: string | null,
  labels: Record<string, string>,
): string {
  if (value == null) return "";
  if (field === "owner") return labels[value] ?? value;
  if (field === "kind") return kindLabel(value);
  if (field === "fee_from_balance" || field === "fee_from_deposits") return `${value}%`;
  return value;
}

export function kindColor(kind: string): string {
  return PRIVATE_KIND_COLORS[kind] ?? PRIVATE_KIND_COLORS.other;
}

/**
 * The color choices offered for an account — the same palette the app
 * uses for categories (CategoryDialog). Every kind's default color is
 * in the list, so the kind default is always pickable.
 */
export const ACCOUNT_COLORS: string[] = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#94a3b8",
];

/** A picked color is only accepted as a #rrggbb hex — anything else falls back to the kind default. */
export function normalizeColor(raw: string | null | undefined, kind: string): string {
  const c = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : kindColor(kind);
}

/**
 * When the account type changes, the color follows the new type's default —
 * unless the user already picked a color by hand, in which case it stays.
 * Shared by the private-account dialog and the index "new account" dialog.
 */
export function colorAfterKindChange(
  current: string | null | undefined,
  colorTouched: boolean,
  kind: string,
): string {
  return colorTouched ? normalizeColor(current, kind) : kindColor(kind);
}

/** Where the account's numbers came from (set by a statement import). */
export const DATA_SOURCE_LABELS: Record<string, string> = {
  manual: "הזנה ידנית",
  statement: "דוח שנתי",
  clearinghouse: "דוח מסלקה פנסיונית",
  portal: "אזור אישי",
};

export function dataSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return DATA_SOURCE_LABELS[source] ?? source;
}

/**
 * The statement's own red fee balloon, as a rule: either fee is above
 * the fund's average (Table ג'). Needs both the member's fee and the
 * fund average — with no comparison data there is no balloon.
 */
export function feesAboveAverage(a: {
  fee_from_balance: number | null;
  fee_from_deposits: number | null;
  avg_fee_from_balance: number | null;
  avg_fee_from_deposits: number | null;
}): boolean {
  const balanceAbove =
    a.fee_from_balance != null &&
    a.avg_fee_from_balance != null &&
    a.fee_from_balance > a.avg_fee_from_balance;
  const depositsAbove =
    a.fee_from_deposits != null &&
    a.avg_fee_from_deposits != null &&
    a.fee_from_deposits > a.avg_fee_from_deposits;
  return balanceAbove || depositsAbove;
}

/* ------------------------------------------------------------------ *
 * Pure rules
 * ------------------------------------------------------------------ */

/**
 * Is this account shown in the shared assets view? Every account kind
 * respects its owner — including IB portfolios, so a child's IB account
 * lives under that child. A missing owner (e.g. rows read before the
 * migration ran) counts as shared, so the app keeps working in that
 * window.
 *
 * The owner is typed as a plain string on purpose: structural callers
 * (net-worth inputs) don't carry the OwnerId type, and the rule only
 * compares against "shared".
 */
export function isSharedAccount(a: { person?: string | null; kind: string }): boolean {
  return (a.person ?? SHARED_OWNER) === SHARED_OWNER;
}

/** Accounts owned by one person — every kind, including IB portfolios. */
export function accountsOfPerson<T extends { person?: string | null; kind: string }>(
  accounts: T[],
  person: OwnerId,
): T[] {
  return accounts.filter((a) => a.person === person);
}

/**
 * The assets index filter: "all" shows the shared accounts (the
 * unfiltered view, with the person entries below), "shared" shows the
 * shared accounts on their own, and a person id shows that person's
 * accounts as cards. Pure, so the filter rule is testable.
 */
export function filterAccountsByOwner<T extends { person?: string | null; kind: string }>(
  accounts: T[],
  owner: OwnerId | "all",
): T[] {
  if (owner === "all" || owner === SHARED_OWNER) return accounts.filter(isSharedAccount);
  return accountsOfPerson(accounts, owner);
}

export interface PrivateAccountExtras {
  /** Total monthly deposits across the accounts (employee + employer + severance parts). */
  monthlyDeposits: number | null;
  /** Total expected monthly pension across the accounts. */
  expectedPension: number | null;
}

/**
 * Sums the statement-only money of a person's private accounts. Each
 * total is null when no account has that data at all — the person page
 * only shows a stat when it exists.
 */
export function sumPrivateAccountExtras(
  accounts: {
    monthly_deposit_employee: number | null;
    monthly_deposit_employer: number | null;
    monthly_deposit_severance: number | null;
    expected_monthly_pension: number | null;
  }[],
): PrivateAccountExtras {
  let deposits = 0;
  let hasDeposits = false;
  let pension = 0;
  let hasPension = false;
  for (const a of accounts) {
    for (const part of [
      a.monthly_deposit_employee,
      a.monthly_deposit_employer,
      a.monthly_deposit_severance,
    ]) {
      if (part != null) {
        deposits += part;
        hasDeposits = true;
      }
    }
    if (a.expected_monthly_pension != null) {
      pension += a.expected_monthly_pension;
      hasPension = true;
    }
  }
  return {
    monthlyDeposits: hasDeposits ? Math.round(deposits * 100) / 100 : null,
    expectedPension: hasPension ? Math.round(pension * 100) / 100 : null,
  };
}

/** The editable metadata of a private account, as stored on the row. */
export interface PrivateMetadata {
  name: string;
  kind: string;
  company: string | null;
  fee_from_balance: number | null;
  fee_from_deposits: number | null;
  track: string | null;
  /** Card/header accent color — a palette pick, defaulting to the kind color. */
  color: string;
  /** Free-text notes — the owner's own words. Deliberately NOT tracked in the history (see diffPrivateAccountFields). */
  notes: string | null;
  person: OwnerId;
}

export interface PrivateAccountChange {
  field: PrivateAccountField;
  oldValue: string | null;
  newValue: string | null;
}

function textValue(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function feeText(v: number | null): string | null {
  return v == null || !Number.isFinite(v) ? null : String(v);
}

/**
 * Diff old vs new metadata — one change per field that actually changed.
 * Empty strings and null both mean "not set", so clearing a field and
 * never having set it produce no change.
 *
 * Notes are deliberately NOT diffed: free-text notes are the owner's own
 * words, not structured data, and every keystroke-level edit would spam
 * the history. They still save through normalize/update like any field.
 */
export function diffPrivateAccountFields(
  oldMeta: PrivateMetadata,
  newMeta: PrivateMetadata,
): PrivateAccountChange[] {
  const changes: PrivateAccountChange[] = [];
  const push = (field: PrivateAccountField, oldV: string | null, newV: string | null) => {
    if (oldV !== newV) changes.push({ field, oldValue: oldV, newValue: newV });
  };
  push("name", textValue(oldMeta.name), textValue(newMeta.name));
  push("kind", oldMeta.kind, newMeta.kind);
  push("color", oldMeta.color, newMeta.color);
  push("company", textValue(oldMeta.company), textValue(newMeta.company));
  push("fee_from_balance", feeText(oldMeta.fee_from_balance), feeText(newMeta.fee_from_balance));
  push("fee_from_deposits", feeText(oldMeta.fee_from_deposits), feeText(newMeta.fee_from_deposits));
  push("track", textValue(oldMeta.track), textValue(newMeta.track));
  push("owner", oldMeta.person ?? SHARED_OWNER, newMeta.person ?? SHARED_OWNER);
  return changes;
}

/** Raw form values for a private account (fees as typed, may be empty). */
export interface PrivateAccountForm {
  name: string;
  kind: string;
  company: string;
  fee_from_balance: string;
  fee_from_deposits: string;
  track: string;
  notes: string;
  /** Palette pick; optional — callers that don't offer a color (statement import) get the kind default. */
  color?: string;
}

/**
 * Normalize + validate form values into storable metadata. Throws on a
 * missing name or an out-of-range fee (fees are percentages, 0–100).
 * Empty text becomes null; empty fees become null (not set).
 */
export function normalizePrivateMetadata(
  form: PrivateAccountForm,
): Omit<PrivateMetadata, "person"> {
  const name = form.name.trim();
  if (!name) throw new Error("צריך שם לחשבון");
  const parseFee = (raw: string, label: string): number | null => {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`דמי ניהול לא תקינים: ${label}`);
    return n;
  };
  return {
    name,
    kind: form.kind,
    company: textValue(form.company),
    fee_from_balance: parseFee(form.fee_from_balance, "מצבירה"),
    fee_from_deposits: parseFee(form.fee_from_deposits, "מהפקדות"),
    track: textValue(form.track),
    color: normalizeColor(form.color, form.kind),
    notes: textValue(form.notes),
  };
}

/* ------------------------------------------------------------------ *
 * Data access
 * ------------------------------------------------------------------ */

export async function fetchPrivateAccountHistory(
  accountId: string,
): Promise<PrivateAccountHistoryRow[]> {
  const { data, error } = await supabase
    .from("private_account_history")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function logPrivateAccountChanges(
  accountId: string,
  changes: PrivateAccountChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const household_id = await getMyHouseholdId();
  const profile = await fetchMyProfile();
  const { error } = await supabase.from("private_account_history").insert(
    changes.map((c) => ({
      household_id,
      investment_account_id: accountId,
      field: c.field,
      old_value: c.oldValue,
      new_value: c.newValue,
      changed_by: profile?.person ?? null,
      changed_by_user_id: profile?.id ?? null,
    })),
  );
  if (error) throw error;
}

export interface CreatePrivateAccountInput extends PrivateAccountForm {
  person: OwnerId;
  currency: string;
  balance: number;
  /** Statement-import extras (Treasury code, expected pension, fund-average fees, deposits, source). */
  statement?: StatementFields;
}

/**
 * Creates a private account through the existing investment_accounts
 * model: the initial balance is converted to ILS before insertion (same
 * rule as createInvestmentAccount), and the card color is the chosen
 * palette pick (kind default when none was offered). The owner is the
 * person whose tab it was created from.
 */
export async function createPrivateAccount(input: CreatePrivateAccountInput): Promise<string> {
  const meta = normalizePrivateMetadata(input);
  if (!Number.isFinite(input.balance) || input.balance < 0) {
    throw new Error("צריך יתרה תקינה");
  }
  const household_id = await getMyHouseholdId();
  const rate = await fetchRateToIls(input.currency);
  const { data, error } = await supabase
    .from("investment_accounts")
    .insert({
      household_id,
      name: meta.name,
      kind: meta.kind,
      currency: input.currency,
      color: meta.color,
      starting_balance: input.balance,
      starting_balance_ils: Math.round(input.balance * rate * 100) / 100,
      person: input.person,
      company: meta.company,
      fee_from_balance: meta.fee_from_balance,
      fee_from_deposits: meta.fee_from_deposits,
      track: meta.track,
      notes: meta.notes,
      ...(input.statement ? statementAccountColumns(input.statement) : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Writes the statement-only columns of an existing account (Treasury
 * code, expected pension, fund-average fees, deposit split, source).
 * The editable metadata (company, fees, kind) goes through
 * updatePrivateAccount instead, so it is recorded in the history.
 */
export async function updateAccountStatementColumns(
  accountId: string,
  fields: StatementFields,
): Promise<void> {
  const { error } = await supabase
    .from("investment_accounts")
    .update(statementAccountColumns(fields))
    .eq("id", accountId);
  if (error) throw error;
}

export interface UpdatePrivateAccountInput extends PrivateAccountForm {
  person: OwnerId;
}

/**
 * Updates a private account's metadata and records every changed field
 * in the history table. The balance is NOT touched here — balance
 * updates go through setAccountBalanceIls on the account page, with
 * their own history. The history write is best-effort: if it fails,
 * the edit itself already succeeded, so the failure is logged rather
 * than reported as a failed save.
 */
export async function updatePrivateAccount(
  account: InvestmentAccount,
  input: UpdatePrivateAccountInput,
): Promise<void> {
  if (account.kind === IB_KIND) throw new Error("לא ניתן לערוך חשבון IB כאן");
  const meta = normalizePrivateMetadata(input);
  const changes = diffPrivateAccountFields(
    {
      name: account.name,
      kind: account.kind,
      company: account.company ?? null,
      fee_from_balance: account.fee_from_balance ?? null,
      fee_from_deposits: account.fee_from_deposits ?? null,
      track: account.track ?? null,
      color: account.color ?? kindColor(account.kind),
      notes: account.notes ?? null,
      person: account.person ?? SHARED_OWNER,
    },
    { ...meta, person: input.person },
  );
  const { error } = await supabase
    .from("investment_accounts")
    .update({
      name: meta.name,
      kind: meta.kind,
      company: meta.company,
      fee_from_balance: meta.fee_from_balance,
      fee_from_deposits: meta.fee_from_deposits,
      track: meta.track,
      notes: meta.notes,
      person: input.person,
      color: meta.color,
    })
    .eq("id", account.id);
  if (error) throw error;

  try {
    await logPrivateAccountChanges(account.id, changes);
  } catch (e) {
    console.error("logPrivateAccountChanges failed (edit already saved)", e);
  }
}

/**
 * Moves an account to another owner — shared, a login member, or an
 * added person. Works for every account kind, including IB portfolios
 * (their metadata can't be edited, but ownership is just the column).
 * The move is recorded in the metadata history as an owner change, so
 * the account page shows where the account used to live. No-op when
 * the owner is unchanged.
 */
export async function setAccountOwner(account: InvestmentAccount, person: OwnerId): Promise<void> {
  const oldOwner = account.person ?? SHARED_OWNER;
  if (oldOwner === person) return;
  const { error } = await supabase
    .from("investment_accounts")
    .update({ person })
    .eq("id", account.id);
  if (error) throw error;
  try {
    await logPrivateAccountChanges(account.id, [
      { field: "owner", oldValue: oldOwner, newValue: person },
    ]);
  } catch (e) {
    console.error("logPrivateAccountChanges failed (owner already moved)", e);
  }
}

/**
 * Replaces the account's hidden fixed-detail rows (stored as stable
 * keys in hidden_detail_fields). Each toggled row is logged in the
 * metadata history as a hide/show change, so the account page shows
 * who hid what and when. No-op when nothing changed.
 */
export async function setHiddenDetailFields(
  account: InvestmentAccount,
  hiddenKeys: string[],
): Promise<void> {
  const oldKeys = account.hidden_detail_fields ?? [];
  const same = oldKeys.length === hiddenKeys.length && oldKeys.every((k) => hiddenKeys.includes(k));
  if (same) return;
  const { error } = await supabase
    .from("investment_accounts")
    .update({ hidden_detail_fields: hiddenKeys })
    .eq("id", account.id);
  if (error) throw error;
  const changes: PrivateAccountChange[] = [];
  for (const key of hiddenKeys) {
    if (!oldKeys.includes(key)) {
      const label = fixedDetailFieldLabel(key);
      changes.push({
        field: "hidden_fields",
        oldValue: `${label}: מוצג`,
        newValue: `${label}: מוסתר`,
      });
    }
  }
  for (const key of oldKeys) {
    if (!hiddenKeys.includes(key)) {
      const label = fixedDetailFieldLabel(key);
      changes.push({
        field: "hidden_fields",
        oldValue: `${label}: מוסתר`,
        newValue: `${label}: מוצג`,
      });
    }
  }
  try {
    await logPrivateAccountChanges(account.id, changes);
  } catch (e) {
    console.error("logPrivateAccountChanges failed (hidden fields already saved)", e);
  }
}

/**
 * Deletes an account. Linked transactions are unlinked (ON DELETE SET
 * NULL), journal entries and history rows are deleted with it (CASCADE).
 * IB portfolios cannot be deleted from here.
 */
export async function deletePrivateAccount(account: InvestmentAccount): Promise<void> {
  if (account.kind === IB_KIND) throw new Error("לא ניתן למחוק חשבון IB כאן");
  const { error } = await supabase.from("investment_accounts").delete().eq("id", account.id);
  if (error) throw error;
}
