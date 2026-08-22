
-- Ledger of buy/sell transactions per IB position, so quantity changes are
-- additive (weighted-average cost) instead of overwriting from scratch, and
-- sells lock in the price at time of sale (not the current market price).
CREATE TABLE public.ib_position_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.ib_positions(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('buy', 'sell')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price numeric NOT NULL CHECK (price >= 0),
  -- Average cost basis of the position immediately before this transaction.
  -- Used to compute realized P&L on sells (price - prior_avg_price) * quantity.
  prior_avg_price numeric,
  occurred_at date NOT NULL DEFAULT current_date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ib_position_transactions TO authenticated;
GRANT ALL ON public.ib_position_transactions TO service_role;

ALTER TABLE public.ib_position_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hh members read ib_position_transactions" ON public.ib_position_transactions
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY "hh members write ib_position_transactions" ON public.ib_position_transactions
  FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

CREATE INDEX ib_position_transactions_symbol_idx
  ON public.ib_position_transactions (household_id, symbol, occurred_at DESC);
