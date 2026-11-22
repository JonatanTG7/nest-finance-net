import { useQuery } from "@tanstack/react-query";
import { fetchMyProfile, updateMyProfile } from "@/lib/household";
import { removePrivateMedia, signMedia, uploadPrivateMediaPath } from "@/lib/private-media";

/**
 * Profile pictures. An avatar lives in one of two places:
 *
 * - an external URL from the auth provider (e.g. Google photo), stored in
 *   profiles.avatar_url at signup — used as-is;
 * - a file in the private `avatars` bucket, stored in profiles.avatar_url
 *   as its household-prefixed storage path and signed only for display
 *   (same rule as all private media: AGENTS.md).
 *
 * Both shapes flow through `resolveAvatarUrl`, so callers never care
 * which one a member has.
 */

export const AVATAR_BUCKET = "avatars" as const;

/** Avatars are shown at ~40px; 5MB is a generous cap for a phone photo. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** True when the stored value is already a displayable URL (auth provider). */
export function isExternalAvatarUrl(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith("https://") || value.startsWith("http://");
}

/** Hebrew validation error for an avatar file, or null when it's fine. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "נא לבחור קובץ תמונה";
  if (file.size > MAX_AVATAR_BYTES) return "התמונה גדולה מדי — עד 5MB";
  return null;
}

/**
 * Turn a stored avatar_url into something an <img> can use: null stays
 * null, an external URL passes through, a storage path gets a signed URL.
 */
export async function resolveAvatarUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (isExternalAvatarUrl(value)) return value;
  return signMedia(value, AVATAR_BUCKET);
}

/** Display URL for one stored avatar value (signs storage paths). */
export function useResolvedAvatarUrl(value: string | null) {
  return useQuery({
    queryKey: ["avatar", value],
    queryFn: () => resolveAvatarUrl(value),
    enabled: value != null,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Upload a new profile picture for the signed-in member and point their
 * profile at it. Returns the stored path. The previous picture is removed
 * from storage when it was one of ours (best effort — a failed delete
 * never fails the upload).
 */
export async function uploadMyAvatar(file: File): Promise<string> {
  const invalid = validateAvatarFile(file);
  if (invalid) throw new Error(invalid);
  const me = await fetchMyProfile();
  if (!me) throw new Error("not signed in");
  const path = await uploadPrivateMediaPath(file, AVATAR_BUCKET);
  await updateMyProfile({ avatar_url: path });
  await removeOldAvatar(me.avatar_url);
  return path;
}

/** Remove the signed-in member's profile picture (back to the initial). */
export async function removeMyAvatar(): Promise<void> {
  const me = await fetchMyProfile();
  if (!me) throw new Error("not signed in");
  await updateMyProfile({ avatar_url: null });
  await removeOldAvatar(me.avatar_url);
}

/** Delete a previous avatar object — only when it was a storage path. */
async function removeOldAvatar(oldValue: string | null): Promise<void> {
  if (!oldValue || isExternalAvatarUrl(oldValue)) return;
  try {
    await removePrivateMedia(oldValue, AVATAR_BUCKET);
  } catch (e) {
    // Orphaned file at worst; never fail the profile update over it.
    console.warn("failed to remove old avatar", e);
  }
}
