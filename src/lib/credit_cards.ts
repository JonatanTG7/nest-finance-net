import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

export type CreditCard = {
  id: string;
  name: string;
  last_four: string;
  billing_day: number;
  sort_order: number;
};

/** Key of the built-in "credit card" payment method. */
export const CREDIT_PM_KEY = "credit";

export function isCreditMethod(key: string | null | undefined) {
  return key === CREDIT_PM_KEY;
}

export function cardLabel(c: Pick<CreditCard, "name" | "last_four">) {
  return c.last_four ? `${c.name} (*${c.last_four})` : c.name;
}

export async function fetchCreditCards(): Promise<CreditCard[]> {
  const { data, error } = await supabase
    .from("credit_cards")
    .select("id, name, last_four, billing_day, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export function useCreditCards() {
  return useQuery({ queryKey: ["credit_cards"], queryFn: fetchCreditCards });
}

export function useInvalidateCreditCards() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["credit_cards"] });
}

export async function createCreditCard(input: {
  name: string;
  last_four: string;
  billing_day: number;
}): Promise<CreditCard> {
  const household_id = await getMyHouseholdId();
  const { data, error } = await supabase
    .from("credit_cards")
    .insert({
      household_id,
      name: input.name.trim(),
      last_four: input.last_four.replace(/\D/g, "").slice(0, 4),
      billing_day: clampDay(input.billing_day),
    })
    .select("id, name, last_four, billing_day, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCreditCard(
  id: string,
  input: { name: string; last_four: string; billing_day: number },
): Promise<void> {
  const { error } = await supabase
    .from("credit_cards")
    .update({
      name: input.name.trim(),
      last_four: input.last_four.replace(/\D/g, "").slice(0, 4),
      billing_day: clampDay(input.billing_day),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCreditCard(id: string): Promise<void> {
  const { error } = await supabase.from("credit_cards").delete().eq("id", id);
  if (error) throw error;
}

function clampDay(d: number) {
  return Math.max(1, Math.min(31, Math.round(d) || 1));
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * The date the money actually leaves the bank account for a purchase made on
 * `occurredAtISO` with a card billed on `billingDay` each month.
 *
 * Purchases made on or before the billing day are collected in that month's
 * cycle; anything later rolls to the next month's charge.
 */
export function chargeDateFor(occurredAtISO: string, billingDay: number): string {
  const y = Number(occurredAtISO.slice(0, 4));
  const m = Number(occurredAtISO.slice(5, 7)) - 1;
  const d = Number(occurredAtISO.slice(8, 10));
  const day = clampDay(billingDay);
  let ty = y;
  let tm = m;
  if (d > day) {
    tm += 1;
    if (tm > 11) {
      tm = 0;
      ty += 1;
    }
  }
  const td = Math.min(day, daysInMonth(ty, tm));
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatChargeDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(
    new Date(y, (m ?? 1) - 1, d ?? 1),
  );
}
