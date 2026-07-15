
CREATE TABLE public.ib_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES public.households(id) ON DELETE CASCADE,
  cash_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ib_holdings TO authenticated;
GRANT ALL ON public.ib_holdings TO service_role;
ALTER TABLE public.ib_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hh members read ib_holdings" ON public.ib_holdings FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY "hh members write ib_holdings" ON public.ib_holdings FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

CREATE TABLE public.ib_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ib_positions TO authenticated;
GRANT ALL ON public.ib_positions TO service_role;
ALTER TABLE public.ib_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hh members read ib_positions" ON public.ib_positions FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY "hh members write ib_positions" ON public.ib_positions FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

CREATE TRIGGER ib_holdings_touch BEFORE UPDATE ON public.ib_holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER ib_positions_touch BEFORE UPDATE ON public.ib_positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
