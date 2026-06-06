import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

export type PaymentMethodRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
};

const LAST_USED_KEY = "last_payment_method";

export function getLastPaymentMethod(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_USED_KEY);
}
export function setLastPaymentMethod(key: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_USED_KEY, key);
  }
}

export async function fetchPaymentMethods(): Promise<PaymentMethodRow[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, key, label, sort_order")
    .order("sort_order")
    .order("label");
  if (error) throw error;
  return data ?? [];
}

export function usePaymentMethods() {
  return useQuery({ queryKey: ["payment_methods"], queryFn: fetchPaymentMethods });
}

export function useInvalidatePaymentMethods() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["payment_methods"] });
}

export async function createPaymentMethod(label: string): Promise<PaymentMethodRow> {
  const clean = label.trim();
  if (!clean) throw new Error("empty");
  const household_id = await getMyHouseholdId();
  const key = `custom_${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ household_id, key, label: clean, sort_order: 99 })
    .select("id, key, label, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePaymentMethod(id: string) {
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) throw error;
}
