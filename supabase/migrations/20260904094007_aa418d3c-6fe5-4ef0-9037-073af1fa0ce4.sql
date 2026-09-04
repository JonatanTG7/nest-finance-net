CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  last_four text NOT NULL CHECK (char_length(last_four) <= 4),
  billing_day integer NOT NULL CHECK (billing_day >= 1 AND billing_day <= 31),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_cards_select" ON public.credit_cards
  FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY "credit_cards_insert" ON public.credit_cards
  FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY "credit_cards_update" ON public.credit_cards
  FOR UPDATE TO authenticated USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY "credit_cards_delete" ON public.credit_cards
  FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE TRIGGER credit_cards_touch BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.transactions
  ADD COLUMN credit_card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_credit_card ON public.transactions(credit_card_id);
