CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  label text NOT NULL,
  face_value numeric NOT NULL,
  remaining_value numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  barcode text,
  expiry_date date,
  image_url text,
  source text NOT NULL DEFAULT 'manual',
  entered_by text NOT NULL,
  occurred_at date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY vouchers_select ON public.vouchers FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY vouchers_insert ON public.vouchers FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY vouchers_update ON public.vouchers FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY vouchers_delete ON public.vouchers FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX vouchers_household_occurred_idx ON public.vouchers (household_id, occurred_at DESC);

CREATE TRIGGER vouchers_touch_updated_at BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();