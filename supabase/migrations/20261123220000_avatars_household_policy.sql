-- Tighten the avatars bucket policy (Supabase security finding, Critical):
-- the original policy (avatars_authenticated_all, PR #17) gave every
-- authenticated user full access to every avatar file in the bucket.
-- Avatars are stored household-prefixed (see src/lib/private-media.ts),
-- so scope access to the caller's own household, exactly like the other
-- private-media buckets (household_media_access). The bucket was empty
-- when this shipped, so no existing object is affected.
-- Applied live 2026-11-23; this file keeps the repo as source of truth.
DROP POLICY IF EXISTS "avatars_authenticated_all" ON storage.objects;
CREATE POLICY "avatars_household_access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (current_household_id())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (current_household_id())::text);
