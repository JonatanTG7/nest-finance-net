import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

export type MediaBucket = "transaction-photos" | "voucher-photos" | "trip-covers" | "avatars";

export function mediaPath(value: string, bucket: MediaBucket): string {
  if (!value.startsWith("https://") && !value.startsWith("http://")) return value;
  const pathname = new URL(value).pathname;
  const marker = `/${bucket}/`;
  const index = pathname.indexOf(marker);
  if (index < 0) throw new Error("קישור תמונה לא תקין");
  return decodeURIComponent(pathname.slice(index + marker.length));
}

export async function signMedia(value: string | null, bucket: MediaBucket): Promise<string | null> {
  if (!value) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(mediaPath(value, bucket), 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Upload a file under the household-prefixed path and return the storage
 * path. Callers that store the value (e.g. avatars) keep the path and sign
 * it only for display — never store a signed URL, it expires.
 */
export async function uploadPrivateMediaPath(file: File, bucket: MediaBucket): Promise<string> {
  const household = await getMyHouseholdId();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${household}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadPrivateMedia(file: File, bucket: MediaBucket): Promise<string> {
  const path = await uploadPrivateMediaPath(file, bucket);
  const url = await signMedia(path, bucket);
  if (!url) throw new Error("לא הצלחנו לטעון את התמונה");
  return url;
}

/** Delete a stored object (accepts a path or a signed URL of it). */
export async function removePrivateMedia(value: string, bucket: MediaBucket): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([mediaPath(value, bucket)]);
  if (error) throw error;
}
