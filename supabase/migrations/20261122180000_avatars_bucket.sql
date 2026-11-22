-- Private bucket for profile pictures (avatars), mirroring the existing
-- trip-covers setup. Files are stored under a household-prefixed path
-- (see src/lib/private-media.ts) and signed only for display; the bucket
-- itself is private. If a bucket named 'avatars' already exists (e.g.
-- created public by a template), force it private — nothing in the app
-- reads avatars through a public URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "avatars_authenticated_all" ON storage.objects;
CREATE POLICY "avatars_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');
