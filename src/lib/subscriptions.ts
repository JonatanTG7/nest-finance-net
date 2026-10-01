import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import { isoLocal, todayISO } from "@/lib/dates";
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

function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate();
}

/** Billing date for a subscription within a given year/month. */
export function billingDateIn(sub: Pick<Subscription, "billing_day">, y: number, m0: number) {
  return isoLocal(new Date(y, m0, Math.min(sub.billing_day, daysInMonth(y, m0))));
}

/** All billing dates from start through `until` (inclusive). */
function dueDates(sub: Subscription, until: string): string[] {
  const out: string[] = [];
  const [sy, sm] = sub.start_date.split("-").map(Number);
  let y = sy;
  let m = sm - 1;
  const stop = sub.end_date && sub.end_date < until ? sub.end_date : until;
  for (let i = 0; i < 600; i++) {
    const d = billingDateIn(sub, y, m);
    if (d > stop) break;
    if (d >= sub.start_date) out.push(d);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
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
      (r: { subscription_id: string; occurred_at: string }) => `${r.subscription_id}|${r.occurred_at}`,
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

/** Status of a subscription for the current calendar month. */
export function monthStatus(sub: Subscription, now = new Date()) {
  const date = billingDateIn(sub, now.getFullYear(), now.getMonth());
  const today = isoLocal(now);
  const inRange = date >= sub.start_date && (!sub.end_date || date <= sub.end_date);
  const charged = date <= today;
  const daysLeft = Math.round(
    (new Date(date + "T00:00").getTime() - new Date(today + "T00:00").getTime()) / 86400000,
  );
  return { date, inRange: sub.active && inRange, charged, daysLeft };
}
