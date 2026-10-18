CREATE TABLE public.household_media (
 bucket_id text NOT NULL,
 object_name text NOT NULL,
 household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
 PRIMARY KEY (bucket_id, object_name)
);
GRANT SELECT ON public.household_media TO authenticated;
GRANT ALL ON public.household_media TO service_role;
ALTER TABLE public.household_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_owner_read ON public.household_media FOR SELECT TO authenticated USING (household_id=public.current_household_id());
INSERT INTO public.household_media(bucket_id, object_name, household_id)
SELECT o.bucket_id, o.name, COALESCE(ref.household_id, p.household_id)
FROM storage.objects o
LEFT JOIN public.profiles p ON p.id::text=o.owner_id
LEFT JOIN LATERAL (
 SELECT t.household_id FROM public.transactions t WHERE o.bucket_id='transaction-photos' AND (t.photo_url=o.name OR split_part(split_part(t.photo_url, '/transaction-photos/', 2), '?', 1)=o.name)
 UNION
 SELECT v.household_id FROM public.vouchers v WHERE o.bucket_id='voucher-photos' AND (v.image_url=o.name OR split_part(split_part(v.image_url, '/voucher-photos/', 2), '?', 1)=o.name)
 UNION
 SELECT tr.household_id FROM public.trips tr WHERE o.bucket_id='trip-covers' AND (tr.cover_image=o.name OR split_part(split_part(tr.cover_image, '/trip-covers/', 2), '?', 1)=o.name)
 LIMIT 1
) ref ON true
WHERE o.bucket_id IN ('transaction-photos','voucher-photos','trip-covers') AND COALESCE(ref.household_id,p.household_id) IS NOT NULL;
DROP POLICY tx_photos_authenticated_all ON storage.objects;
DROP POLICY voucher_photos_authenticated_all ON storage.objects;
DROP POLICY trip_covers_authenticated_all ON storage.objects;
CREATE POLICY household_media_access ON storage.objects FOR ALL TO authenticated
USING (bucket_id IN ('transaction-photos','voucher-photos','trip-covers') AND ((storage.foldername(name))[1]=public.current_household_id()::text OR EXISTS (SELECT 1 FROM public.household_media m WHERE m.bucket_id=objects.bucket_id AND m.object_name=objects.name AND m.household_id=public.current_household_id())))
WITH CHECK (bucket_id IN ('transaction-photos','voucher-photos','trip-covers') AND (storage.foldername(name))[1]=public.current_household_id()::text);
ALTER PUBLICATION supabase_realtime ADD TABLE public.investment_accounts;