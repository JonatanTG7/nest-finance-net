DROP POLICY IF EXISTS "tx photos read" ON storage.objects;
DROP POLICY IF EXISTS "tx photos insert" ON storage.objects;
DROP POLICY IF EXISTS "tx photos update" ON storage.objects;
DROP POLICY IF EXISTS "tx photos delete" ON storage.objects;

REVOKE EXECUTE ON FUNCTION public.leave_household() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_household() TO authenticated;