import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Person } from "@/lib/person";
import type { TxType } from "@/lib/finance";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"] & {
  category: Category | null;
  transaction_tags: { tag: Tag }[];
};

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTransactionsBetween(startISO: string, endISO: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, category:categories(*), transaction_tags(tag:tags(*))")
    .gte("occurred_at", startISO)
    .lt("occurred_at", endISO)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

export async function fetchAllTransactions(limit = 500) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, category:categories(*), transaction_tags(tag:tags(*))")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

export async function fetchTransaction(id: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, category:categories(*), transaction_tags(tag:tags(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Transaction | null;
}

export interface TransactionInput {
  type: TxType;
  amount: number;
  currency: string;
  fx_rate_to_ils: number;
  category_id: string | null;
  title: string;
  note: string | null;
  occurred_at: string;
  entered_by: Person;
  tag_names: string[];
}

async function ensureTags(names: string[]): Promise<string[]> {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) return [];
  // Upsert (unique on name)
  const { data, error } = await supabase
    .from("tags")
    .upsert(clean.map((name) => ({ name })), { onConflict: "name" })
    .select("id, name");
  if (error) throw error;
  return (data ?? []).map((t) => t.id);
}

export async function createTransaction(input: TransactionInput) {
  const amount_ils = Number((input.amount * input.fx_rate_to_ils).toFixed(2));
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      fx_rate_to_ils: input.fx_rate_to_ils,
      amount_ils,
      category_id: input.category_id,
      title: input.title,
      note: input.note,
      occurred_at: input.occurred_at,
      entered_by: input.entered_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  const tagIds = await ensureTags(input.tag_names);
  if (tagIds.length) {
    const { error: linkErr } = await supabase
      .from("transaction_tags")
      .insert(tagIds.map((tag_id) => ({ transaction_id: tx.id, tag_id })));
    if (linkErr) throw linkErr;
  }
  return tx.id;
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const amount_ils = Number((input.amount * input.fx_rate_to_ils).toFixed(2));
  const { error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      fx_rate_to_ils: input.fx_rate_to_ils,
      amount_ils,
      category_id: input.category_id,
      title: input.title,
      note: input.note,
      occurred_at: input.occurred_at,
      entered_by: input.entered_by,
    })
    .eq("id", id);
  if (error) throw error;

  // Replace tags
  const { error: delErr } = await supabase
    .from("transaction_tags")
    .delete()
    .eq("transaction_id", id);
  if (delErr) throw delErr;
  const tagIds = await ensureTags(input.tag_names);
  if (tagIds.length) {
    const { error: linkErr } = await supabase
      .from("transaction_tags")
      .insert(tagIds.map((tag_id) => ({ transaction_id: id, tag_id })));
    if (linkErr) throw linkErr;
  }
}

export async function deleteTransaction(id: string) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}
