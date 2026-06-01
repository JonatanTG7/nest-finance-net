import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Person } from "@/lib/person";
import type { TxType } from "@/lib/finance";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type InvestmentAccount =
  Database["public"]["Tables"]["investment_accounts"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"] & {
  category: Category | null;
  transaction_tags: { tag: Tag }[];
  investment_account?: InvestmentAccount | null;
};

const TX_SELECT =
  "*, category:categories(*), investment_account:investment_accounts(*), transaction_tags(tag:tags(*))";

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

export async function fetchInvestmentAccounts(): Promise<InvestmentAccount[]> {
  const { data, error } = await supabase
    .from("investment_accounts")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTransactionsBetween(startISO: string, endISO: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
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
    .select(TX_SELECT)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

export async function fetchTransaction(id: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Transaction | null;
}

export async function fetchInvestmentTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("type", "investment")
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

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
  investment_account_id?: string | null;
  payment_method?: PaymentMethod | null;
}

async function ensureTags(names: string[]): Promise<string[]> {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) return [];
  const { data, error } = await supabase
    .from("tags")
    .upsert(clean.map((name) => ({ name })), { onConflict: "name" })
    .select("id, name");
  if (error) throw error;
  return (data ?? []).map((t) => t.id);
}

function rowFromInput(input: TransactionInput) {
  const amount_ils = Number((input.amount * input.fx_rate_to_ils).toFixed(2));
  return {
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
    investment_account_id:
      input.type === "investment" ? input.investment_account_id ?? null : null,
    payment_method: input.payment_method ?? null,
  };
}

export async function createTransaction(input: TransactionInput) {
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert(rowFromInput(input))
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
  const { error } = await supabase
    .from("transactions")
    .update(rowFromInput(input))
    .eq("id", id);
  if (error) throw error;

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
