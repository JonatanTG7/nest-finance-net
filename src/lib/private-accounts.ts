import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId, fetchMyProfile } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import type { Person } from "@/lib/person";
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
  "company" | "fee_from_balance" | "fee_from_deposits" | "track" | "name" | "kind" | "owner";

export const PRIVATE_FIELD_LABELS: Record<PrivateAccountField, string> = {
  company: "חברה",
  fee_from_balance: "דמי ניהול מצבירה",
  fee_from_deposits: "דמי ניהול מהפקדות",
  track: "מסלול",
  name: "שם",
  kind: "סוג חשבון",
  owner: "בעלים",
};

/** Account types offered for private accounts. */
export const PRIVATE_ACCOUNT_KINDS = ["pension", "provident", "savings", "investment"] as const;
export type PrivateAccountKind = (typeof PRIVATE_ACCOUNT_KINDS)[number];

export const PRIVATE_KIND_LABELS: Record<string, string> = {
  pension: "קרן פנסיה",
  provident: "קופת גמל / השתלמות",
  savings: "חיסכון",
  investment: "השקעה",
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

export function kindColor(kind: string): string {
  return PRIVATE_KIND_COLORS[kind] ?? PRIVATE_KIND_COLORS.other;
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
 * Is this account shown in the shared assets view? IB portfolios are
 * always shared — they are never private, whatever the owner column says.
 * A missing owner (e.g. rows read before the migration ran) counts as
 * shared, so the app keeps working in that window.
 */
export function isSharedAccount(a: { person?: Person | null; kind: string }): boolean {
  if (a.kind === IB_KIND) return true;
  return (a.person ?? "shared") === "shared";
}

/** Accounts owned by one person. IB portfolios never count as private. */
export function accountsOfPerson<T extends { person?: Person | null; kind: string }>(
  accounts: T[],
  person: Person,
): T[] {
  return accounts.filter((a) => a.kind !== IB_KIND && a.person === person);
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
  person: Person;
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
  push("company", textValue(oldMeta.company), textValue(newMeta.company));
  push("fee_from_balance", feeText(oldMeta.fee_from_balance), feeText(newMeta.fee_from_balance));
  push("fee_from_deposits", feeText(oldMeta.fee_from_deposits), feeText(newMeta.fee_from_deposits));
  push("track", textValue(oldMeta.track), textValue(newMeta.track));
  push("owner", oldMeta.person ?? "shared", newMeta.person ?? "shared");
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

async function logPrivateAccountChanges(
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
  person: Person;
  currency: string;
  balance: number;
  /** Statement-import extras (Treasury code, expected pension, fund-average fees, deposits, source). */
  statement?: StatementFields;
}

/**
 * Creates a private account through the existing investment_accounts
 * model: the initial balance is converted to ILS before insertion (same
 * rule as createInvestmentAccount), and the card color follows the
 * account type. The owner is the person whose tab it was created from.
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
      color: kindColor(meta.kind),
      starting_balance: input.balance,
      starting_balance_ils: Math.round(input.balance * rate * 100) / 100,
      person: input.person,
      company: meta.company,
      fee_from_balance: meta.fee_from_balance,
      fee_from_deposits: meta.fee_from_deposits,
      track: meta.track,
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
  person: Person;
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
      person: (account.person ?? "shared") as Person,
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
      person: input.person,
      color: kindColor(meta.kind),
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
 * Deletes an account. Linked transactions are unlinked (ON DELETE SET
 * NULL), journal entries and history rows are deleted with it (CASCADE).
 * IB portfolios cannot be deleted from here.
 */
export async function deletePrivateAccount(account: InvestmentAccount): Promise<void> {
  if (account.kind === IB_KIND) throw new Error("לא ניתן למחוק חשבון IB כאן");
  const { error } = await supabase.from("investment_accounts").delete().eq("id", account.id);
  if (error) throw error;
}
