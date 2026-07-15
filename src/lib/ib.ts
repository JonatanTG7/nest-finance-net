import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

export const IB_ACCOUNT_ID = "8456b768-3747-4685-96d1-db66e2b7c432";

export interface IbHoldings {
  id: string;
  household_id: string;
  cash_usd: number;
}

export interface IbPosition {
  id: string;
  household_id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
}

export async function fetchIbHoldings(): Promise<IbHoldings | null> {
  const { data, error } = await supabase.from("ib_holdings").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    household_id: data.household_id,
    cash_usd: Number(data.cash_usd ?? 0),
  };
}

export async function setIbCash(usd: number): Promise<void> {
  const household_id = await getMyHouseholdId();
  const { error } = await supabase
    .from("ib_holdings")
    .upsert({ household_id, cash_usd: usd }, { onConflict: "household_id" });
  if (error) throw error;
}

export async function fetchIbPositions(): Promise<IbPosition[]> {
  const { data, error } = await supabase.from("ib_positions").select("*").order("symbol");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    household_id: r.household_id,
    symbol: r.symbol,
    quantity: Number(r.quantity ?? 0),
    avg_price: Number(r.avg_price ?? 0),
  }));
}

export async function upsertIbPosition(input: {
  id?: string;
  symbol: string;
  quantity: number;
  avg_price: number;
}): Promise<void> {
  const household_id = await getMyHouseholdId();
  const symbol = input.symbol.trim().toUpperCase();
  if (input.id) {
    const { error } = await supabase
      .from("ib_positions")
      .update({ symbol, quantity: input.quantity, avg_price: input.avg_price })
      .eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("ib_positions")
      .upsert(
        { household_id, symbol, quantity: input.quantity, avg_price: input.avg_price },
        { onConflict: "household_id,symbol" },
      );
    if (error) throw error;
  }
}

export async function deleteIbPosition(id: string): Promise<void> {
  const { error } = await supabase.from("ib_positions").delete().eq("id", id);
  if (error) throw error;
}
