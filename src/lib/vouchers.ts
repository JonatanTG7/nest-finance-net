import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Person } from "@/lib/person";
import { todayISO } from "@/lib/dates";
import { getMyHouseholdId } from "@/lib/household";
import { mediaPath, signMedia, uploadPrivateMedia } from "@/lib/private-media";

export type Voucher = Database["public"]["Tables"]["vouchers"]["Row"];

export async function fetchVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from("vouchers")
    .select("*")
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (v) => ({ ...v, image_url: await signMedia(v.image_url, "voucher-photos") })));
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
    .insert({ ...input, image_url: input.image_url ? mediaPath(input.image_url, "voucher-photos") : null, household_id })
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
  return uploadPrivateMedia(file, "voucher-photos");
}

export function isExpired(v: Voucher): boolean {
  if (!v.expiry_date) return false;
  return v.expiry_date < todayISO();
}

/** Marks a voucher fully used and deletes its photo from storage; the record stays for history. */
export async function markVoucherUsed(v: Voucher): Promise<void> {
  const { error } = await supabase.from("vouchers").update({ remaining_value: 0, image_url: null }).eq("id", v.id);
  if (error) throw error;
  if (v.image_url) {
    const { error: rmError } = await supabase.storage.from("voucher-photos").remove([mediaPath(v.image_url, "voucher-photos")]);
    if (rmError) console.error("[vouchers] photo delete failed", rmError);
  }
}
