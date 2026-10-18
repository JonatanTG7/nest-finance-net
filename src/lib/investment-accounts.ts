import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";

export async function createInvestmentAccount(input: { name: string; kind: string; currency: string; balance: number }) {
  if (!input.name.trim() || !Number.isFinite(input.balance) || input.balance < 0) throw new Error("צריך שם ויתרה תקינה");
  const household_id = await getMyHouseholdId();
  const rate = await fetchRateToIls(input.currency);
  const { data, error } = await supabase.from("investment_accounts").insert({
    household_id, name: input.name.trim(), kind: input.kind, currency: input.currency,
    starting_balance: input.balance, starting_balance_ils: Math.round(input.balance * rate * 100) / 100,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}