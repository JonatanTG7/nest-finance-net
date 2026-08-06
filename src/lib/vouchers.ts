import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Person } from "@/lib/person";
import { getMyHouseholdId } from "@/lib/household";

export type Voucher = Database["public"]["Tables"]["vouchers"]["Row"];

export async function fetchVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from("vouchers")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface VoucherInput {
  label: string;
  face_value: number;
  remaining_value: number;
  currency: string;
  barcode: string | null;
  expiry_date: string | null;
  image_url: string | null;
  source: "ai" | "manual";
  entered_by: Person;
  occurred_at: string;
}

export async function createVoucher(input: VoucherInput): Promise<Voucher> {
  const household_id = await getMyHouseholdId();
  const { data, error } = await supabase
    .from("vouchers")
    .insert({ ...input, household_id })
    .select("*")
    .single();
  if (error) throw error;
  return data as Voucher;
}

export async function updateVoucher(
  id: string,
  patch: Partial<{
    label: string;
    face_value: number;
    remaining_value: number;
    barcode: string | null;
    expiry_date: string | null;
    occurred_at: string;
  }>,
): Promise<void> {
  const { error } = await supabase.from("vouchers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteVoucher(id: string): Promise<void> {
  const { error } = await supabase.from("vouchers").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadVoucherPhoto(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("voucher-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("voucher-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? path;
}

export function isExpired(v: Voucher): boolean {
  if (!v.expiry_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return v.expiry_date < today;
}
