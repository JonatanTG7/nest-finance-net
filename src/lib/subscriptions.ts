import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { dueDates } from "@/lib/subscription-schedule";
export { billingDateIn, monthStatus } from "@/lib/subscription-schedule";
import type { Person } from "@/lib/person";

export type Subscription = {
  id: string;
  name: string;
  emoji: string;
  category_id: string | null;
  amount: number;
  currency: string;
  billing_day: number;
  entered_by: Person;
  payment_method: string | null;
  credit_card_id: string | null;
  start_date: string;
  end_date: string | null;
  payment_count: number | null;
  active: boolean;
};

export type SubscriptionInput = Omit<Subscription, "id">;

// The table is new; cast to avoid depending on regenerated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .order("billing_day")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r: Subscription) => ({ ...r, amount: Number(r.amount) }));
}

export function useSubscriptions() {
  return useQuery({ queryKey: ["subscriptions"], queryFn: fetchSubscriptions });
}

export function useInvalidateSubscriptions() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

export async function saveSubscription(input: SubscriptionInput, id?: string) {
  if (input.payment_count != null && (!Number.isInteger(input.payment_count) || input.payment_count < 1)) {
    throw new Error("מספר התשלומים חייב להיות מספר שלם גדול מאפס");
  }
  if (!input.start_date || (input.end_date && input.end_date < input.start_date)) {
    throw new Error("תאריך הסיום חייב להיות אחרי תאריך ההתחלה");
  }
  const household_id = await getMyHouseholdId();
  const row = { ...input, billing_day: Math.max(1, Math.min(31, Math.round(input.billing_day))) };
  if (id) {
    const { error } = await db.from("subscriptions").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await db.from("subscriptions").insert({ ...row, household_id });
    if (error) throw error;
  }
}

export async function deleteSubscription(id: string) {
  const { error } = await db.from("subscriptions").delete().eq("id", id);
  if (error) throw error;
}

let syncing: Promise<number> | null = null;

/**
 * Creates real transactions for every billing date that has already arrived
 * (never future dates). Safe to run from both phones — a unique index on
 * (subscription_id, occurred_at) prevents duplicates.
 */
export function syncSubscriptions(): Promise<number> {
  if (!syncing) syncing = doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync(): Promise<number> {
  const subs = (await fetchSubscriptions()).filter((s) => s.active);
  if (!subs.length) return 0;
  const today = todayISO();
  const household_id = await getMyHouseholdId();
  const { data: existing, error } = await db
    .from("transactions")
    .select("subscription_id, occurred_at")
    .in(
      "subscription_id",
      subs.map((s) => s.id),
    );
  if (error) throw error;
  const have = new Set(
    (existing ?? []).map(
      (r: { subscription_id: string; occurred_at: string }) =>
        `${r.subscription_id}|${r.occurred_at}`,
    ),
  );
  const { data: auth } = await supabase.auth.getUser();
  const rateCache = new Map<string, number>();
  let created = 0;
  for (const s of subs) {
    for (const d of dueDates(s, today)) {
      if (have.has(`${s.id}|${d}`)) continue;
      let rate = rateCache.get(s.currency);
      if (rate == null) {
        rate = s.currency === "ILS" ? 1 : await fetchRateToIls(s.currency).catch(() => 1);
        rateCache.set(s.currency, rate);
      }
      const { error: insErr } = await db.from("transactions").insert({
        type: "fixed",
        amount: s.amount,
        currency: s.currency,
        fx_rate_to_ils: rate,
        amount_ils: Number((s.amount * rate).toFixed(2)),
        category_id: s.category_id,
        title: `${s.emoji} ${s.name}`.trim(),
        note: "נוצר אוטומטית ממרכז המנויים",
        occurred_at: d,
        entered_by: s.entered_by,
        payment_method: s.payment_method,
        credit_card_id: s.credit_card_id,
        household_id,
        user_id: auth.user?.id ?? null,
        subscription_id: s.id,
      });
      if (!insErr) created++;
    }
  }
  return created;
}

