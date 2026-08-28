
-- The `trips` table and `transactions.trip_id` column already exist in this
-- database (created outside a tracked migration). This migration only adds
-- what's missing: row-level security so households can actually read/write
-- their own trips, and a storage bucket for cover-image uploads. Everything
-- here is safe to re-run.

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh members read trips" ON public.trips;
CREATE POLICY "hh members read trips" ON public.trips
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());

DROP POLICY IF EXISTS "hh members write trips" ON public.trips;
CREATE POLICY "hh members write trips" ON public.trips
  FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

DROP TRIGGER IF EXISTS trips_touch_updated_at ON public.trips;
CREATE TRIGGER trips_touch_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cover-image storage bucket, mirroring the existing voucher-photos setup.
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-covers', 'trip-covers', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "trip_covers_authenticated_all" ON storage.objects;
CREATE POLICY "trip_covers_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'trip-covers')
  WITH CHECK (bucket_id = 'trip-covers');
