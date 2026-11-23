import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { dueDates } from "@/lib/subscription-schedule";
export { billingDateIn, monthStatus } from "@/lib/subscription-schedule";
import type { Person } from "@/lib/person";

export type RecurringIncome = {
  id: string;
  name: string;
  emoji: string;
  category_id: string | null;
  amount: number;
  currency: string;
  billing_day: number;
  entered_by: Person;
  start_date: string;
  end_date: string | null;
  payment_count: number | null;
  active: boolean;
};

export type RecurringIncomeInput = Omit<RecurringIncome, "id">;

// The table is new; cast to avoid depending on regenerated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchRecurringIncome(): Promise<RecurringIncome[]> {
  const { data, error } = await db
    .from("recurring_income")
    .select("*")
    .order("billing_day")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r: RecurringIncome) => ({ ...r, amount: Number(r.amount) }));
}

export function useRecurringIncome() {
  return useQuery({ queryKey: ["recurring_income"], queryFn: fetchRecurringIncome });
}

export function useInvalidateRecurringIncome() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["recurring_income"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

export async function saveRecurringIncome(input: RecurringIncomeInput, id?: string) {
  if (
    input.payment_count != null &&
    (!Number.isInteger(input.payment_count) || input.payment_count < 1)
  ) {
    throw new Error("מספר התשלומים חייב להיות מספר שלם גדול מאפס");
  }
  if (!input.start_date || (input.end_date && input.end_date < input.start_date)) {
    throw new Error("תאריך הסיום חייב להיות אחרי תאריך ההתחלה");
  }
  const household_id = await getMyHouseholdId();
  const row = { ...input, billing_day: Math.max(1, Math.min(31, Math.round(input.billing_day))) };
  if (id) {
    const { error } = await db.from("recurring_income").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await db.from("recurring_income").insert({ ...row, household_id });
    if (error) throw error;
  }
}

export async function deleteRecurringIncome(id: string) {
  const { error } = await db.from("recurring_income").delete().eq("id", id);
  if (error) throw error;
}

export type ExistingOccurrence = { recurring_income_id: string; occurred_at: string };

/**
 * Pure core of the sync: which (item, date) pairs still need an income
 * transaction. Dates come from the shared schedule rules; anything already
 * recorded is skipped, so generation and the monthly status cannot disagree.
 */
export function missingOccurrences(
  items: RecurringIncome[],
  existing: ExistingOccurrence[],
  today: string,
): { item: RecurringIncome; date: string }[] {
  const have = new Set(existing.map((r) => `${r.recurring_income_id}|${r.occurred_at}`));
  const out: { item: RecurringIncome; date: string }[] = [];
  for (const item of items) {
    if (!item.active) continue;
    for (const d of dueDates(item, today)) {
      if (!have.has(`${item.id}|${d}`)) out.push({ item, date: d });
    }
  }
  return out;
}

let syncing: Promise<number> | null = null;

/**
 * Creates real income transactions for every occurrence date that has
 * already arrived (never future dates). Safe to run from both phones — a
 * unique index on (recurring_income_id, occurred_at) prevents duplicates.
 */
export function syncRecurringIncome(): Promise<number> {
  if (!syncing) syncing = doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync(): Promise<number> {
  const items = (await fetchRecurringIncome()).filter((s) => s.active);
  if (!items.length) return 0;
  const today = todayISO();
  const household_id = await getMyHouseholdId();
  const { data: existing, error } = await db
    .from("transactions")
    .select("recurring_income_id, occurred_at")
    .in(
      "recurring_income_id",
      items.map((s) => s.id),
    );
  if (error) throw error;
  const missing = missingOccurrences(items, existing ?? [], today);
  const { data: auth } = await supabase.auth.getUser();
  const rateCache = new Map<string, number>();
  let created = 0;
  for (const { item: s, date: d } of missing) {
    // Fetch the rate once per currency, BEFORE creating any transaction.
    // A failed fetch must NEVER fall back to rate 1 (that would record a
    // $10 income as 10 ₪): skip this item for now — with no transaction
    // created, the next sync run will retry it.
    let rate = rateCache.get(s.currency);
    if (rate == null) {
      if (s.currency === "ILS") {
        rate = 1;
      } else {
        try {
          rate = await fetchRateToIls(s.currency);
        } catch (e) {
          console.warn("[recurring-income] skipping, FX rate unavailable", s.currency, e);
          continue;
        }
      }
      rateCache.set(s.currency, rate);
    }
    const { error: insErr } = await db.from("transactions").insert({
      type: "income",
      amount: s.amount,
      currency: s.currency,
      fx_rate_to_ils: rate,
      amount_ils: Number((s.amount * rate).toFixed(2)),
      category_id: s.category_id,
      title: `${s.emoji} ${s.name}`.trim(),
      note: "נוצר אוטומטית מהכנסות קבועות",
      occurred_at: d,
      entered_by: s.entered_by,
      // Income transactions carry no payment method (see TransactionForm).
      payment_method: null,
      credit_card_id: null,
      household_id,
      user_id: auth.user?.id ?? null,
      recurring_income_id: s.id,
    });
    if (!insErr) created++;
  }
  return created;
}
