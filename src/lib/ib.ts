import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { logBalanceChange } from "@/lib/balance_history";

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

export interface IbTransaction {
  id: string;
  position_id: string | null;
  symbol: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  prior_avg_price: number | null;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

// פונקציה חדשה למציאת המזהה האמיתי במסד הנתונים
async function getIbAccountId(household_id: string): Promise<string | null> {
  const { data } = await supabase
    .from("investment_accounts")
    .select("id")
    .eq("household_id", household_id)
    .ilike("name", "%Interactive Brokers%")
    .maybeSingle();
  return data?.id ?? null;
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

export async function fetchIbTransactions(symbol?: string): Promise<IbTransaction[]> {
  let query = supabase
    .from("ib_position_transactions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (symbol) query = query.eq("symbol", symbol.trim().toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    position_id: r.position_id,
    symbol: r.symbol,
    kind: r.kind as "buy" | "sell",
    quantity: Number(r.quantity),
    price: Number(r.price),
    prior_avg_price: r.prior_avg_price != null ? Number(r.prior_avg_price) : null,
    occurred_at: r.occurred_at,
    note: r.note,
    created_at: r.created_at,
  }));
}

/**
 * Buy shares of a symbol (new or existing position). Recalculates the
 * position's average cost as a weighted average across the old and new
 * quantities, and records the transaction in the ledger. Optionally debits
 * cash by quantity * price.
 */
export async function buyIbShares(input: {
  symbol: string;
  quantity: number;
  price: number;
  occurred_at: string;
  note?: string;
  adjustCash: boolean;
  currentCash: number;
}): Promise<void> {
  const household_id = await getMyHouseholdId();
  const symbol = input.symbol.trim().toUpperCase();
  if (input.quantity <= 0) throw new Error("כמות חייבת להיות חיובית");

  const { data: existing, error: exErr } = await supabase
    .from("ib_positions")
    .select("*")
    .eq("household_id", household_id)
    .eq("symbol", symbol)
    .maybeSingle();
  if (exErr) throw exErr;

  const oldQty = existing ? Number(existing.quantity) : 0;
  const oldAvg = existing ? Number(existing.avg_price) : 0;
  const newQty = oldQty + input.quantity;
  const newAvg = newQty > 0 ? (oldQty * oldAvg + input.quantity * input.price) / newQty : input.price;

  let positionId: string;
  if (existing) {
    const { error } = await supabase
      .from("ib_positions")
      .update({ quantity: newQty, avg_price: newAvg })
      .eq("id", existing.id);
    if (error) throw error;
    positionId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("ib_positions")
      .insert({ household_id, symbol, quantity: newQty, avg_price: newAvg })
      .select("id")
      .single();
    if (error) throw error;
    positionId = inserted.id;
  }

  const { error: txErr } = await supabase.from("ib_position_transactions").insert({
    household_id,
    position_id: positionId,
    symbol,
    kind: "buy",
    quantity: input.quantity,
    price: input.price,
    prior_avg_price: oldAvg,
    occurred_at: input.occurred_at,
    note: input.note ?? null,
  });
  if (txErr) throw txErr;

  if (input.adjustCash) {
    const cost = input.quantity * input.price;
    const newCash = input.currentCash - cost;
    await setIbCash(newCash);
    
    // התיקון: שליפה דינמית ועטיפה ב-try/catch
    try {
      const ibAccId = await getIbAccountId(household_id);
      if (ibAccId) {
        await logBalanceChange({
          investment_account_id: ibAccId,
          kind: `קניית ${symbol}`,
          old_amount: input.currentCash,
          new_amount: newCash,
          currency: "USD",
        });
      }
    } catch (err) {
      console.error("שגיאה ברישום היסטוריית יתרה, אך הקנייה בוצעה", err);
    }
  }
}

/**
 * Sell shares of an existing position at a fixed price (locked in
 * regardless of the current market price). Reduces quantity; if it reaches
 * zero the position is removed but the transaction stays in the ledger.
 * Average cost basis of the remaining shares is unchanged. Optionally
 * credits cash by quantity * price.
 */
export async function sellIbShares(input: {
  positionId: string;
  symbol: string;
  quantity: number;
  price: number;
  occurred_at: string;
  note?: string;
  adjustCash: boolean;
  currentCash: number;
}): Promise<{ realizedPnl: number }> {
  const household_id = await getMyHouseholdId();
  const symbol = input.symbol.trim().toUpperCase();
  if (input.quantity <= 0) throw new Error("כמות חייבת להיות חיובית");

  const { data: existing, error: exErr } = await supabase
    .from("ib_positions")
    .select("*")
    .eq("id", input.positionId)
    .single();
  if (exErr) throw exErr;

  const oldQty = Number(existing.quantity);
  const oldAvg = Number(existing.avg_price);
  const sellQty = Math.min(input.quantity, oldQty);
  const newQty = Math.max(0, oldQty - sellQty);

  if (newQty <= 0.000001) {
    const { error } = await supabase.from("ib_positions").delete().eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("ib_positions")
      .update({ quantity: newQty })
      .eq("id", existing.id);
    if (error) throw error;
  }

  const { error: txErr } = await supabase.from("ib_position_transactions").insert({
    household_id,
    position_id: newQty <= 0.000001 ? null : existing.id,
    symbol,
    kind: "sell",
    quantity: sellQty,
    price: input.price,
    prior_avg_price: oldAvg,
    occurred_at: input.occurred_at,
    note: input.note ?? null,
  });
  if (txErr) throw txErr;

  const realizedPnl = (input.price - oldAvg) * sellQty;

  if (input.adjustCash) {
    const proceeds = sellQty * input.price;
    const newCash = input.currentCash + proceeds;
    await setIbCash(newCash);
    
    // התיקון למכירה
    try {
      const ibAccId = await getIbAccountId(household_id);
      if (ibAccId) {
        await logBalanceChange({
          investment_account_id: ibAccId,
          kind: `מכירת ${symbol}`,
          old_amount: input.currentCash,
          new_amount: newCash,
          currency: "USD",
        });
      }
    } catch (err) {
      console.error("שגיאה ברישום היסטוריית יתרה, אך המכירה בוצעה", err);
    }
  }

  return { realizedPnl };
}