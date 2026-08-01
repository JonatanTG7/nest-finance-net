CREATE TABLE public.trips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  cities text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT CURRENT_DATE,
  budget numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  cover_image text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY trips_select ON public.trips FOR SELECT TO authenticated
  USING (household_id = current_household_id());
CREATE POLICY trips_insert ON public.trips FOR INSERT TO authenticated
  WITH CHECK (household_id = current_household_id());
CREATE POLICY trips_update ON public.trips FOR UPDATE TO authenticated
  USING (household_id = current_household_id())
  WITH CHECK (household_id = current_household_id());
CREATE POLICY trips_delete ON public.trips FOR DELETE TO authenticated
  USING (household_id = current_household_id());

CREATE TRIGGER trips_touch_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX trips_household_idx ON public.trips(household_id, start_date DESC);

ALTER TABLE public.transactions
  ADD COLUMN trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

CREATE INDEX transactions_trip_idx ON public.transactions(trip_id);