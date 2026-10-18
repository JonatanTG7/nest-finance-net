import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

export async function fetchBudgets() {
  const { data, error } = await supabase.from("category_budgets").select("category_id, amount_ils");
  if (error) throw error;
  return data ?? [];
}

export async function saveBudget(categoryId: string, amount: number | null) {
  const household_id = await getMyHouseholdId();
  if (amount === null) {
    const { error } = await supabase.from("category_budgets").delete().eq("household_id", household_id).eq("category_id", categoryId);
    if (error) throw error;
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("התקציב צריך להיות גדול מאפס");
  const { error } = await supabase.from("category_budgets").upsert({ household_id, category_id: categoryId, amount_ils: amount });
  if (error) throw error;
}