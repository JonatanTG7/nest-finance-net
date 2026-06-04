
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS tags_household_name_uq ON public.tags(household_id, name);
