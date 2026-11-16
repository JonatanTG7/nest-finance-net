import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, fetchMyProfile } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import type { Person } from "@/lib/person";

export interface BalanceHistoryRow {
  id: string;
  investment_account_id: string | null;
  kind: string;
  changed_by: Person | null;
  old_amount: number;
  new_amount: number;
  currency: string;
  note: string | null;
  created_at: string;
}

export async function fetchBalanceHistory(
  accountId: string,
  limit = 100,
): Promise<BalanceHistoryRow[]> {
  const { data, error } = await supabase
    .from("account_balance_history")
    .select("*")
    .eq("investment_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    investment_account_id: r.investment_account_id,
    kind: r.kind,
    changed_by: (r.changed_by as Person | null) ?? null,
    old_amount: Number(r.old_amount ?? 0),
    new_amount: Number(r.new_amount ?? 0),
    currency: r.currency,
    note: r.note,
    created_at: r.created_at,
  }));
}

export async function logBalanceChange(input: {
  investment_account_id: string;
  kind?: string;
  old_amount: number;
  new_amount: number;
  currency: string;
  note?: string | null;
}): Promise<void> {
  const household_id = await getMyHouseholdId();
  const profile = await fetchMyProfile();
  const { error } = await supabase.from("account_balance_history").insert({
    household_id,
    investment_account_id: input.investment_account_id,
    kind: input.kind ?? "balance",
    changed_by: profile?.person ?? null,
    changed_by_user_id: profile?.id ?? null,
    old_amount: input.old_amount,
    new_amount: input.new_amount,
    currency: input.currency,
    note: input.note ?? null,
  });
  if (error) throw error;
}

/**
 * Sets an investment/savings account balance (input is ALWAYS in ILS) and logs
 * the change to the permanent history table.
 *
 * Historical transactions are NEVER modified: instead the account is stamped
 * with balance_reset_at, and balance totals only count transactions created
 * after the reset. (The old code zeroed every transaction's amounts — an
 * irreversible data loss — to make the displayed balance match.)
 */
export async function setAccountBalanceIls(input: {
  accountId: string;
  currency: string;
  oldIls: number;
  newIls: number;
  fxRate?: number;
}): Promise<void> {
  const { accountId, currency, oldIls, newIls } = input;
  let native = newIls;
  if (currency !== "ILS") {
    // The rate must match the account's own currency (not always USD), and a
    // failed fetch must throw — never silently convert at a wrong rate.
    const rate = input.fxRate && input.fxRate > 0 ? input.fxRate : await fetchRateToIls(currency);
    native = newIls / rate;
  }
  const { error } = await supabase
    .from("investment_accounts")
    .update({
      starting_balance: native,
      starting_balance_ils: newIls,
      balance_reset_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw error;

  await logBalanceChange({
    investment_account_id: accountId,
    kind: "balance",
    old_amount: oldIls,
    new_amount: newIls,
    currency: "ILS",
  });
}
