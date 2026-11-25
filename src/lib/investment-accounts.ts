import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { fetchRateToIls } from "@/lib/fx";
import { SHARED_OWNER, type OwnerId } from "@/lib/person";
import { normalizeColor } from "@/lib/private-accounts";

export async function createInvestmentAccount(input: {
  name: string;
  kind: string;
  currency: string;
  balance: number;
  person?: OwnerId;
  /** Palette pick; optional — callers that don't offer a color get the kind default. */
  color?: string;
}) {
  if (!input.name.trim() || !Number.isFinite(input.balance) || input.balance < 0)
    throw new Error("צריך שם ויתרה תקינה");
  const household_id = await getMyHouseholdId();
  const rate = await fetchRateToIls(input.currency);
  const { data, error } = await supabase
    .from("investment_accounts")
    .insert({
      household_id,
      name: input.name.trim(),
      kind: input.kind,
      currency: input.currency,
      color: normalizeColor(input.color, input.kind),
      starting_balance: input.balance,
      starting_balance_ils: Math.round(input.balance * rate * 100) / 100,
      person: input.person ?? SHARED_OWNER,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
